#!/usr/bin/env node

import {
  asyncAutocomplete,
  CancelationToken,
  Choice,
  Choices,
  Style,
} from 'async-autocomplete-cli'
import chalk from 'chalk'
import {
  CloudWatchLogsClient,
  LogStream,
  DescribeLogStreamsRequest,
  DescribeLogStreamsCommand,
  paginateDescribeLogStreams,
  DescribeLogStreamsCommandOutput,
} from '@aws-sdk/client-cloudwatch-logs'
import { Readable, Writable } from 'stream'
import { loadRecents, addRecent } from './recents'
import stripAnsi from 'strip-ansi'
import { column } from './column'
import selectCloudWatchLogGroup from './selectCloudWatchLogGroup'
import timeAgo from './timeAgo'

export type LogStreamForChoice = Pick<
  LogStream,
  'arn' | 'logStreamName' | 'creationTime' | 'lastEventTimestamp'
>

type ChoiceProps = {
  LogStream?: LogStream
  arn?: string
  logStreamName?: string
}

function createChoice(
  LogStream: LogStreamForChoice,
  options?: { recent?: boolean }
): Choice<ChoiceProps> {
  const { arn, logStreamName, lastEventTimestamp } = LogStream
  const rest = `  ${
    options?.recent ?
      chalk.magentaBright('(recent)')
    : ' '.repeat('(recent)'.length)
  }  ${column(timeAgo(lastEventTimestamp ?? NaN), '59 minutes ago'.length)}`
  return {
    title:
      column(
        logStreamName,
        Math.min(120, process.stdout.columns - stripAnsi(rest).length - 4)
      ) + rest,
    value: {
      LogStream: options?.recent ? undefined : LogStream,
      arn,
      logStreamName,
    },
  }
}

export default async function selectCloudWatchLogStream({
  logs = new CloudWatchLogsClient(),
  logGroupName,
  logGroupIdentifier,
  message,
  MaxLoad = 500,
  MaxResults = 20,
  useRecents = true,
  stdin = process.stdin,
  stdout = process.stderr,
  ...autocompleteOpts
}: {
  logs?: CloudWatchLogsClient
  logGroupName?: string
  logGroupIdentifier?: string
  message?: string
  MaxLoad?: number
  MaxResults?: number
  useRecents?: boolean
  limit?: number
  style?: Style
  clearFirst?: boolean
  stdin?: Readable
  stdout?: Writable
} = {}): Promise<LogStream> {
  const region = await logs.config.region()
  if (!message) message = `Select a CloudWatch LogStream (region: ${region})`

  const profile =
    process.env.AWS_PROFILE || (await logs.config.credentials()).accessKeyId

  if (!logGroupName && !logGroupIdentifier) {
    ;({ logGroupName } = await selectCloudWatchLogGroup({
      logs,
      stdin,
      stdout,
      useRecents,
      ...autocompleteOpts,
    }))
  }

  const cachedPages: DescribeLogStreamsCommandOutput[] = []
  let loadedCount = 0

  const args: DescribeLogStreamsRequest = {
    limit: 50,
    logGroupName,
    logGroupIdentifier,
    orderBy: 'LastEventTime',
    descending: true,
  }
  async function* paginateWithCache() {
    yield* cachedPages
    if (loadedCount >= MaxLoad) return
    for await (const page of paginateDescribeLogStreams(
      { client: logs },
      { ...args, nextToken: cachedPages[cachedPages.length - 1]?.nextToken }
    )) {
      cachedPages.push(page)
      yield page
      loadedCount += page.logStreams?.length ?? 0
      if (loadedCount >= MaxLoad) break
    }
  }

  const selected = await asyncAutocomplete({
    ...autocompleteOpts,
    stdin,
    stdout,
    message,
    suggest: async (
      input: string,
      cancelationToken: CancelationToken,
      yieldChoices: (choices: Choices<ChoiceProps>) => void
    ): Promise<Choices<ChoiceProps> | void> => {
      const choices: Choices<ChoiceProps> = []

      if (!input && useRecents) {
        choices.push(
          ...(
            await loadRecents<LogStream>([
              'selectCloudWatchLogStream',
              profile,
              region,
              logGroupName || logGroupIdentifier || '',
            ])
          ).map((i) => createChoice(i, { recent: true }))
        )
        yieldChoices(choices)
      }

      let regex
      try {
        regex = new RegExp(input.trim(), 'i')
      } catch {
        regex = new RegExp(
          input.trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'),
          'i'
        )
      }
      if (cancelationToken.canceled) return []
      const ac = new AbortController()
      cancelationToken.once('canceled', () => ac.abort())

      for await (const page of paginateWithCache()) {
        const { logStreams = [] } = page
        if (ac.signal.aborted) break
        for (const LogStream of logStreams) {
          if (regex.test(LogStream.logStreamName || '')) {
            choices.push({
              ...createChoice(LogStream),
              initial: !choices.length,
            })
          }
          if (choices.length >= MaxResults) break
        }
        if (choices.length >= MaxResults) break
      }

      if (!choices.length) {
        choices.push({
          title: chalk.gray(
            `No matching CloudWatch LogStreams found (only the most recent ${MaxLoad} were checked)`
          ),

          value: undefined as any,
        })
      }

      return choices
    },
  })
  if (!selected) throw new Error('no CloudWatch LogStream was selected')

  let { LogStream } = selected
  const { arn, logStreamName } = selected

  if (!LogStream && logStreamName) {
    const { logStreams = [] } = await logs.send(
      new DescribeLogStreamsCommand({
        logGroupName,
        logStreamNamePrefix: logStreamName,
      })
    )
    LogStream = arn ? logStreams.find((g) => g.arn === arn) : logStreams[0]
  }
  if (!LogStream) throw new Error(`failed to describe LogStream: ${arn}`)

  if (useRecents) {
    await addRecent(
      [
        'selectCloudWatchLogStream',
        profile,
        region,
        logGroupName || logGroupIdentifier || '',
      ],
      LogStream,
      (i) => i.arn
    )
  }
  return LogStream
}
