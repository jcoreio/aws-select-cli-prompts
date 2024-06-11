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
  LogGroup,
  DescribeLogGroupsRequest,
  DescribeLogGroupsCommand,
} from '@aws-sdk/client-cloudwatch-logs'
import { Readable, Writable } from 'stream'
import { loadRecents, addRecent } from './recents'
import stripAnsi from 'strip-ansi'
import { formatDate } from './formatDate'
import { column } from './column'

export type LogGroupForChoice = Pick<
  LogGroup,
  'arn' | 'logGroupName' | 'creationTime'
>

type ChoiceProps = { LogGroup?: LogGroup; arn?: string; logGroupName?: string }

function createChoice(
  LogGroup: LogGroupForChoice,
  options?: { recent?: boolean }
): Choice<ChoiceProps> {
  const { arn, logGroupName, creationTime } = LogGroup
  const rest = `  ${
    options?.recent
      ? chalk.magentaBright('(recent)')
      : ' '.repeat('(recent)'.length)
  }  ${column(
    formatDate(new Date(creationTime ?? NaN)),
    '2022/03/17 17:37'.length
  )}`
  return {
    title:
      column(
        logGroupName,
        Math.min(120, process.stdout.columns - stripAnsi(rest).length - 4)
      ) + rest,
    value: {
      LogGroup: options?.recent ? undefined : LogGroup,
      arn,
      logGroupName,
    },
  }
}

export default async function selectCloudWatchLogGroup({
  logs = new CloudWatchLogsClient(),
  message,
  MaxResults = 50,
  useRecents = true,
  stdin = process.stdin,
  stdout = process.stderr,
  ...autocompleteOpts
}: {
  logs?: CloudWatchLogsClient
  message?: string
  MaxResults?: number
  useRecents?: boolean
  limit?: number
  style?: Style
  clearFirst?: boolean
  stdin?: Readable
  stdout?: Writable
} = {}): Promise<LogGroup> {
  const region = await logs.config.region()
  if (!message) message = `Select a CloudWatch LogGroup (region: ${region})`

  const profile =
    process.env.AWS_PROFILE || (await logs.config.credentials()).accessKeyId

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
            await loadRecents<LogGroup>([
              'selectCloudWatchLogGroup',
              profile,
              region,
            ])
          ).map((i) => createChoice(i, { recent: true }))
        )
        yieldChoices(choices)
      }

      const args: DescribeLogGroupsRequest = {
        limit: MaxResults,
        ...(input
          ? {
              logGroupNamePattern: input,
            }
          : {}),
      }
      if (cancelationToken.canceled) return []
      const ac = new AbortController()
      cancelationToken.once('canceled', () => ac.abort())
      const { logGroups } = await logs.send(
        new DescribeLogGroupsCommand(args),
        {
          abortSignal: ac.signal,
        }
      )

      for (const LogGroup of logGroups || []) {
        choices.push({
          ...createChoice(LogGroup),
          initial: !choices.length,
        })
      }

      if (!choices.length) {
        choices.push({
          title: chalk.gray('No matching CloudWatch LogGroups found'),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          value: undefined as any,
        })
      }

      return choices
    },
  })
  if (!selected) throw new Error('no CloudWatch LogGroup was selected')

  let { LogGroup } = selected
  const { arn, logGroupName } = selected

  if (!LogGroup && logGroupName) {
    const { logGroups = [] } = await logs.send(
      new DescribeLogGroupsCommand({
        logGroupNamePrefix: logGroupName,
      })
    )
    LogGroup = arn ? logGroups.find((g) => g.arn === arn) : logGroups[0]
  }
  if (!LogGroup) throw new Error(`failed to describe LogGroup: ${arn}`)

  if (useRecents) {
    await addRecent(
      ['selectCloudWatchLogGroup', profile, region],
      LogGroup,
      (i) => i.arn
    )
  }
  return LogGroup
}

if (require.main === module) {
  ;(async () => {
    const { cli } = await import('./cli')
    await cli({
      select: () => selectCloudWatchLogGroup(),
      queries: {
        arn: 'arn',
      },
    })
  })()
}
