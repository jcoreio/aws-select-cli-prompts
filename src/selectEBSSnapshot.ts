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

import {
  DescribeSnapshotsCommand,
  DescribeSnapshotsRequest,
  EC2,
  Snapshot,
  SnapshotState,
} from '@aws-sdk/client-ec2'

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

function formatState(State: SnapshotState | null | undefined): string {
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
  Snapshot,
  'SnapshotId' | 'Description' | 'Tags' | 'StartTime' | 'State'
>

type ChoiceProps = { Snapshot?: Snapshot; SnapshotId?: string }

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
  ec2 = new EC2(),
  message,
  Filters = [],
  MaxResults = 100,
  useRecents = true,
  ...autocompleteOpts
}: {
  ec2?: EC2
  message?: string
  Filters?: DescribeSnapshotsRequest['Filters']
  MaxResults?: number
  useRecents?: boolean
  limit?: number
  style?: Style
  clearFirst?: boolean
  stdin?: Readable
  stdout?: Writable
} = {}): Promise<Snapshot> {
  const region = await ec2.config.region()
  if (!message) message = `Select an EBS Snapshot (region: ${region})`

  const profile =
    process.env.AWS_PROFILE || (await ec2.config.credentials()).accessKeyId

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
            await loadRecents<Snapshot>(['selectEBSSnapshot', profile, region])
          ).map((i) => createChoice(i, { recent: true }))
        )
        yieldChoices(choices)
      }

      const args: DescribeSnapshotsRequest = {
        MaxResults: Math.floor(MaxResults / 2),
      }

      if (cancelationToken.canceled) return []
      const ac = new AbortController()
      cancelationToken.once('canceled', () => ac.abort())

      const [{ Snapshots: Snapshots1 }, { Snapshots: Snapshots2 }] =
        await Promise.all([
          ec2.send(
            new DescribeSnapshotsCommand({
              ...args,
              Filters: [
                ...Filters,
                { Name: 'tag:Name', Values: [`*${input}*`] },
              ],
            }),
            { abortSignal: ac.signal }
          ),
          ec2.send(
            new DescribeSnapshotsCommand({
              ...args,
              Filters: [
                ...Filters,
                { Name: 'description', Values: [`*${input}*`] },
              ],
            }),
            { abortSignal: ac.signal }
          ),
        ])

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
    const described = await ec2.send(
      new DescribeSnapshotsCommand({
        SnapshotIds: [SnapshotId],
      })
    )
    Snapshot = described.Snapshots?.[0]
  }
  if (!Snapshot) throw new Error(`failed to describe snapshot: ${SnapshotId}`)

  if (useRecents) {
    await addRecent(
      ['selectEBSSnapshot', profile, region],
      Snapshot,
      (s) => s.SnapshotId
    )
  }
  return Snapshot
}

if (require.main === module) {
  ;(async () => {
    const { cli } = await import('./cli')
    await cli({
      select: () => selectEBSSnapshot(),
      queries: {
        id: 'SnapshotId',
        vol: 'VolumneId',
      },
    })
  })()
}
