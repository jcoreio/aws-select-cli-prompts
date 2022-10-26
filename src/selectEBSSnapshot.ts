#!/usr/bin/env node

import {
  asyncAutocomplete,
  CancelationToken,
  Choice,
  Choices,
  Style,
} from 'async-autocomplete-cli'
import chalk from 'chalk'

import { Readable, Writable } from 'stream'

import AWS from 'aws-sdk'

import { loadRecents, addRecent } from './recents'

function column(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any,
  length: number
): string {
  value = String(value ?? '').padEnd(length)
  return value.length > length ? `${value.substring(0, length - 3)}...` : value
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
  return `${datePart(y)}/${datePart(M)}/${datePart(d)} ${datePart(
    h
  )}:${datePart(m)}`
}

function formatState(State: AWS.EC2.SnapshotState | null | undefined): string {
  if (!State) return ''
  switch (State) {
    case 'pending':
      return chalk.gray('🔵 Pending')
    case 'completed':
      return chalk.green('🟢 Completed')
    case 'error':
      return chalk.gray('🔴 Error')
  }
  return chalk.gray(State)
}

const stateLength = formatState('completed').length

export type SnapshotForChoice = Pick<
  AWS.EC2.Snapshot,
  'SnapshotId' | 'Description' | 'Tags' | 'StartTime' | 'State'
>

type ChoiceProps = { Snapshot?: AWS.EC2.Snapshot; SnapshotId?: string }

function createChoice(
  Snapshot: SnapshotForChoice,
  options?: { recent?: boolean }
): Choice<ChoiceProps> {
  const { SnapshotId, Description, Tags = [], State, StartTime } = Snapshot
  const name = (Tags.find((t) => t.Key === 'Name') || {}).Value
  return {
    title: `${column(name, 32)}  ${column(Description, 32)}  ${column(
      SnapshotId,
      22
    )}  ${column(
      options?.recent ? chalk.magentaBright('(recent)') : formatState(State),
      stateLength
    )}  ${column(formatDate(StartTime), '2022/03/17 17:37'.length)}`,
    value: { Snapshot: options?.recent ? undefined : Snapshot, SnapshotId },
  }
}

export default async function selectEBSSnapshot({
  ec2 = new AWS.EC2(),
  message = `Select an EBS Snapshot (region: ${ec2.config.region})`,
  Filters = [],
  MaxResults = 100,
  useRecents = true,
  ...autocompleteOpts
}: {
  ec2?: AWS.EC2
  message?: string
  Filters?: AWS.EC2.DescribeSnapshotsRequest['Filters']
  MaxResults?: number
  useRecents?: boolean
  limit?: number
  style?: Style
  clearFirst?: boolean
  stdin?: Readable
  stdout?: Writable
} = {}): Promise<AWS.EC2.Snapshot> {
  const selected = await asyncAutocomplete({
    ...autocompleteOpts,
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
            await loadRecents<AWS.EC2.Snapshot>(ec2.config, 'selectEBSSnapshot')
          ).map((i) => createChoice(i, { recent: true }))
        )
        yieldChoices(choices)
      }

      const args: AWS.EC2.DescribeSnapshotsRequest = {
        MaxResults: Math.floor(MaxResults / 2),
      }
      const request1 = ec2.describeSnapshots({
        ...args,
        Filters: [...Filters, { Name: 'tag:Name', Values: [`*${input}*`] }],
      })
      const request2 = ec2.describeSnapshots({
        ...args,
        Filters: [...Filters, { Name: 'description', Values: [`*${input}*`] }],
      })
      cancelationToken.once('canceled', () => {
        request1.abort()
        request2.abort()
      })

      if (cancelationToken.canceled) return []

      const [{ Snapshots: Snapshots1 }, { Snapshots: Snapshots2 }] =
        await Promise.all([request1.promise(), request2.promise()])
      for (const Snapshot of [...(Snapshots1 || []), ...(Snapshots2 || [])]) {
        choices.push({
          ...createChoice(Snapshot),
          initial: !choices.length,
        })
      }

      if (!choices.length) {
        choices.push({
          title: chalk.gray('No matching EBS Snapshots found'),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          value: undefined as any,
        })
      }

      return choices
    },
  })
  if (!selected) throw new Error('no EBS snapshot was selected')

  let { Snapshot } = selected
  const { SnapshotId } = selected

  if (!Snapshot && SnapshotId) {
    const described = await ec2
      .describeSnapshots({
        SnapshotIds: [SnapshotId],
      })
      .promise()
    Snapshot = described.Snapshots?.[0]
  }
  if (!Snapshot) throw new Error(`failed to describe snapshot: ${SnapshotId}`)

  if (useRecents) {
    await addRecent(
      ec2.config,
      'selectEBSSnapshot',
      Snapshot,
      (s) => s.SnapshotId
    )
  }
  return Snapshot
}

if (require.main === module) {
  selectEBSSnapshot().then(
    (snapshot) => {
      // eslint-disable-next-line no-console
      console.log(snapshot.SnapshotId)
      process.exit(0)
    },
    (error) => {
      // eslint-disable-next-line no-console
      console.error(error.stack)
      process.exit(1)
    }
  )
}
