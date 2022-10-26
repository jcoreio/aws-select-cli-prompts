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

function formatState(State: AWS.EC2.InstanceState | null | undefined): string {
  if (!State) return ''
  switch (State.Name) {
    case 'pending':
      return chalk.gray('🔵 Pending')
    case 'running':
      return chalk.green('🟢 Running')
    case 'shutting-down':
      return chalk.gray('🟠 Shutting Down')
    case 'terminated':
      return chalk.gray('⚫️ Terminated')
    case 'stopping':
      return chalk.gray('🟠 Stopping')
    case 'stopped':
      return chalk.gray('🔴 Stopped')
  }
  return chalk.gray(State.Name)
}

const stateLength = formatState({ Code: 32, Name: 'shutting-down' }).length

export type InstanceForChoice = Pick<
  AWS.EC2.Instance,
  'InstanceId' | 'Tags' | 'State' | 'LaunchTime'
>

type ChoiceProps = { Instance?: AWS.EC2.Instance; InstanceId?: string }

function createChoice(
  Instance: InstanceForChoice,
  options?: { recent?: boolean }
): Choice<ChoiceProps> {
  const { InstanceId, Tags = [], State, LaunchTime } = Instance
  const name = (Tags.find((t) => t.Key === 'Name') || {}).Value
  return {
    title: `${column(name, 32)}  ${column(InstanceId, 19)}  ${column(
      options?.recent ? chalk.magentaBright('(recent)') : formatState(State),
      stateLength
    )}  ${column(formatDate(LaunchTime), '2022/03/17 17:37'.length)}`,
    value: { Instance: options?.recent ? undefined : Instance, InstanceId },
  }
}

export default async function selectEC2Instance({
  ec2 = new AWS.EC2(),
  message = `Select an EC2 Instance (region: ${ec2.config.region})`,
  Filters: _Filters = [],
  MaxResults = 100,
  useRecents = true,
  ...autocompleteOpts
}: {
  ec2?: AWS.EC2
  message?: string
  Filters?: AWS.EC2.DescribeInstancesRequest['Filters']
  MaxResults?: number
  useRecents?: boolean
  limit?: number
  style?: Style
  clearFirst?: boolean
  stdin?: Readable
  stdout?: Writable
} = {}): Promise<AWS.EC2.Instance> {
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
            await loadRecents<AWS.EC2.Instance>(ec2.config, 'selectEC2Instance')
          ).map((i) => createChoice(i, { recent: true }))
        )
        yieldChoices(choices)
      }

      const Filters: AWS.EC2.DescribeInstancesRequest['Filters'] = [..._Filters]
      if (input)
        Filters.push({
          Name: 'tag:Name',
          Values: [`*${input}*`],
        })
      const args: AWS.EC2.DescribeInstancesRequest = { MaxResults }
      if (Filters.length) args.Filters = Filters
      const request = ec2.describeInstances(args)
      cancelationToken.once('canceled', () => request.abort())

      if (cancelationToken.canceled) return []

      const { Reservations } = await request.promise()
      for (const { Instances } of Reservations || []) {
        for (const Instance of Instances || []) {
          choices.push({
            ...createChoice(Instance),
            initial: !choices.length,
          })
        }
      }

      if (!choices.length) {
        choices.push({
          title: chalk.gray('No matching EC2 Instances found'),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          value: undefined as any,
        })
      }

      return choices
    },
  })
  if (!selected) throw new Error('no EC2 instance was selected')

  let { Instance } = selected
  const { InstanceId } = selected

  if (!Instance && InstanceId) {
    const described = await ec2
      .describeInstances({
        InstanceIds: [InstanceId],
      })
      .promise()
    Instance = described.Reservations?.[0]?.Instances?.[0]
  }
  if (!Instance) throw new Error(`failed to describe instance: ${InstanceId}`)

  if (useRecents) {
    await addRecent(
      ec2.config,
      'selectEC2Instance',
      Instance,
      (i) => i.InstanceId
    )
  }
  return Instance
}

if (require.main === module) {
  selectEC2Instance().then(
    (instance) => {
      // eslint-disable-next-line no-console
      console.log(instance.InstanceId)
      process.exit(0)
    },
    (error) => {
      // eslint-disable-next-line no-console
      console.error(error.stack)
      process.exit(1)
    }
  )
}
