#!/usr/bin/env node

import {
  asyncAutocomplete,
  CancelationToken,
  Choice,
  Choices,
  Style,
} from 'async-autocomplete-cli'

import { Readable, Writable } from 'stream'

import AWS from 'aws-sdk'

import { loadRecents, addRecent } from './recents'

function createChoice(Instance: AWS.EC2.Instance): Choice<AWS.EC2.Instance> {
  const { InstanceId, Tags = [] } = Instance
  const name = (Tags.find(t => t.Key === 'Name') || {}).Value
  return {
    title: `${InstanceId} ${name || ''}`,
    value: Instance,
  }
}

export default async function selectEC2Instance({
  ec2 = new AWS.EC2(),
  message = `Select an EC2 Instance (region: ${ec2.config.region})`,
  MaxResults = 100,
  useRecents = true,
  ...autocompleteOpts
}: {
  ec2?: AWS.EC2
  message?: string
  MaxResults?: number
  useRecents?: boolean
  limit?: number
  style?: Style
  clearFirst?: boolean
  stdin?: Readable
  stdout?: Writable
} = {}): Promise<AWS.EC2.Instance> {
  let selected = await asyncAutocomplete({
    ...autocompleteOpts,
    message,
    suggest: async (
      input: string,
      cancelationToken: CancelationToken,
      yieldChoices: (choices: Choices<AWS.EC2.Instance>) => void
    ): Promise<Choices<AWS.EC2.Instance> | void> => {
      const choices: Choices<AWS.EC2.Instance> = []

      if (!input && useRecents) {
        choices.push(
          ...(
            await loadRecents<AWS.EC2.Instance>(ec2.config, 'selectEC2Instance')
          ).map(({ title, ...rest }) => ({
            title: `${title} (recent)`,
            ...rest,
          }))
        )
        yieldChoices(choices)
      }

      const Filters: AWS.EC2.DescribeInstancesRequest['Filters'] = []
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
          title: 'No matching EC2 Instances found',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          value: undefined as any,
        })
      }

      return choices
    },
  })
  if (!selected) throw new Error('no EC2 instance was selected')

  if (typeof selected === 'string') {
    const described = await ec2
      .describeInstances({
        InstanceIds: [selected],
      })
      .promise()
    const Instance = described.Reservations?.[0]?.Instances?.[0]
    if (!Instance) throw new Error(`failed to describe instance: ${selected}`)
    selected = Instance
  }

  if (useRecents) {
    await addRecent(ec2.config, 'selectEC2Instance', {
      title: createChoice(selected).title,
      value: selected.InstanceId,
    })
  }
  return selected
}

if (require.main === module) {
  selectEC2Instance().then(
    instance => {
      // eslint-disable-next-line no-console
      console.log(instance.InstanceId)
      process.exit(0)
    },
    error => {
      // eslint-disable-next-line no-console
      console.error(error.stack)
      process.exit(1)
    }
  )
}
