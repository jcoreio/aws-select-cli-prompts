#!/usr/bin/env node

import chalk from 'chalk'
import { DescribeInstancesCommand, EC2Client } from '@aws-sdk/client-ec2'
import timeAgo from './timeAgo'
import { makeSelector } from './makeSelector'

const selectEC2Instance = makeSelector({
  thing: 'EC2 Instance',
  recentKey: ['selectEC2Instance'],
  defaultLimit: 100,
  getClient: (config) => new EC2Client(config),
  getPage: ({ client, search, limit, abortSignal }) =>
    client.send(
      new DescribeInstancesCommand({
        ...(search && {
          Filters: [{ Name: 'tag:Name', Values: [`*${search}*`] }],
        }),
        MaxResults: limit,
      }),
      { abortSignal }
    ),
  getItems: (page) => page.Reservations?.flatMap((r) => r.Instances || []),
  getId: (item) => item.InstanceId,
  refetchRecent: ({ client, id, abortSignal }) =>
    client
      .send(new DescribeInstancesCommand({ InstanceIds: [id] }), {
        abortSignal,
      })
      .then((r) => r?.Reservations?.[0]?.Instances?.[0]),
  columns: {
    __Name__: {
      get: (i) => i.Tags?.find((t) => t.Key === 'Name')?.Value,
    },
    InstanceId: { width: 19 },
    'State.Name': {
      showRecent: true,
      format: {
        pending: '🔵 Pending',
        running: '🟢 Running',
        'shutting-down': '🟠 Shutting Down',
        terminated: '⚫️ Terminated',
        stopping: '🟠 Stopping',
        stopped: '🔴 Stopped',
      },
      colors: {
        running: chalk.green,
        __other__: chalk.gray,
      },
      width: '🟠 Shutting Down'.length,
    },
    LaunchTime: { format: timeAgo },
  },
})

export default selectEC2Instance
