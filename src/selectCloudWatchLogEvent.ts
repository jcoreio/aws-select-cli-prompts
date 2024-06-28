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
  DescribeLogStreamsCommand,
  OutputLogEvent,
  paginateFilterLogEvents,
  paginateGetLogEvents,
} from '@aws-sdk/client-cloudwatch-logs'
import { Readable, Writable } from 'stream'
import selectCloudWatchLogGroup from './selectCloudWatchLogGroup'
import selectCloudWatchLogStream from './selectCloudWatchLogStream'
import { column } from './column'

function createChoice(event: OutputLogEvent): Choice<OutputLogEvent> {
  const { message, timestamp } = event
  return {
    title: `${column(
      formatDate(new Date(timestamp ?? NaN)),
      dateWidth
    )}  ${message}`,
    value: event,
  }
}

function datePart(part: number, length = 2): string {
  return String(part).padStart(length, '0')
}

function formatDate(date: Date | null | undefined): string {
  if (!date) return ''
  const y = date.getFullYear()
  const M = date.getMonth() + 1
  const d = date.getDate()
  const h = date.getHours()
  const m = date.getMinutes()
  const s = date.getSeconds()
  const ms = date.getMilliseconds()
  return `${datePart(y)}/${datePart(M)}/${datePart(d)} ${datePart(
    h
  )}:${datePart(m)}:${datePart(s)}.${datePart(ms, 3)}`
}

const dateWidth = formatDate(new Date()).length

export default async function selectCloudWatchLogEvent({
  logs = new CloudWatchLogsClient(),
  logGroupName,
  logGroupIdentifier,
  logStreamName: _logStreamName,
  startTime,
  message,
  useRecents = true,
  stdin = process.stdin,
  stdout = process.stderr,
  ...autocompleteOpts
}: {
  logs?: CloudWatchLogsClient
  logGroupName?: string
  logGroupIdentifier?: string
  logStreamName?: string
  startTime?: number
  message?: string
  MaxLoad?: number
  MaxResults?: number
  useRecents?: boolean
  limit?: number
  style?: Style
  clearFirst?: boolean
  stdin?: Readable
  stdout?: Writable
} = {}): Promise<OutputLogEvent> {
  const region = await logs.config.region()
  if (!message) message = `Select a CloudWatch Log Event (region: ${region})`

  if (!logGroupName && !logGroupIdentifier) {
    ;({ logGroupName } = await selectCloudWatchLogGroup({
      logs,
      stdin,
      stdout,
      useRecents,
      ...autocompleteOpts,
    }))
  }

  const logStreamName =
    _logStreamName ||
    (
      await selectCloudWatchLogStream({
        logs,
        logGroupName,
        logGroupIdentifier,
        stdin,
        stdout,
        useRecents,
        ...autocompleteOpts,
      })
    ).logStreamName
  if (!logStreamName) {
    throw new Error(`failed to get logStreamName`)
  }

  if (startTime == null) {
    const { logStreams = [] } = await logs.send(
      new DescribeLogStreamsCommand({
        logGroupName,
        logStreamNamePrefix: logStreamName,
      })
    )
    const logStream = logStreams.find((g) => g.logStreamName === logStreamName)
    startTime = (logStream?.lastEventTimestamp || Date.now()) - 5 * 60000
  }

  const selected = await asyncAutocomplete({
    limit: process.stdout.rows - 1,
    ...autocompleteOpts,
    stdin,
    stdout,
    message,
    suggest: async (
      input: string,
      cancelationToken: CancelationToken
    ): Promise<Choices<OutputLogEvent> | void> => {
      const choices: Choices<OutputLogEvent> = []

      if (cancelationToken.canceled) return []
      const ac = new AbortController()
      cancelationToken.once('canceled', () => ac.abort())

      let filterPattern: string | undefined = input

      const timeAgoMatch =
        /^(\d+)\s*(months?|mos?|weeks?|wks?|w|days?|d|hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s|ms)\s+ago$/i.exec(
          input.trim()
        )
      if (timeAgoMatch) {
        filterPattern = undefined
        const [, quantity, unit] = timeAgoMatch
        let offset = parseInt(quantity)
        switch (unit.toLowerCase()) {
          case 'months':
          case 'month':
          case 'mos':
          case 'mo':
            offset *= 30 * 24 * 3600000
            break
          case 'weeks':
          case 'week':
          case 'wks':
          case 'wk':
          case 'w':
            offset *= 7 * 24 * 3600000
            break
          case 'days':
          case 'day':
          case 'd':
            offset *= 24 * 3600000
            break
          case 'hours':
          case 'hour':
          case 'hrs':
          case 'hr':
          case 'h':
            offset *= 3600000
            break
          case 'minutes':
          case 'minute':
          case 'mins':
          case 'min':
          case 'm':
            offset *= 60000
            break
          case 'seconds':
          case 'second':
          case 'secs':
          case 'sec':
          case 's':
            offset *= 1000
            break
        }
        startTime = Date.now() - offset
      }
      for await (const { events = [] } of filterPattern
        ? paginateFilterLogEvents(
            {
              client: logs,
              stopOnSameToken: true,
            },
            {
              logStreamNames: [logStreamName],
              filterPattern,
              logGroupIdentifier,
              logGroupName,
              startTime,
              endTime: Date.now(),
            }
          )
        : paginateGetLogEvents(
            { client: logs, stopOnSameToken: true },
            {
              logStreamName,
              logGroupIdentifier,
              logGroupName,
              startTime,
              endTime: Date.now(),
            }
          )) {
        if (ac.signal.aborted) break
        for (const event of events) {
          choices.push(createChoice(event))
        }
      }

      if (!choices.length) {
        choices.push({
          title: chalk.gray(`No matching events found`),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          value: undefined as any,
        })
      }

      return choices
    },
  })
  if (!selected) throw new Error('no event was selected')
  return selected
}

if (require.main === module) {
  ;(async () => {
    const { cli } = await import('./cli')
    await cli({
      select: (args) => selectCloudWatchLogEvent(args),
      queries: {
        arn: 'arn',
      },
    })
  })()
}
