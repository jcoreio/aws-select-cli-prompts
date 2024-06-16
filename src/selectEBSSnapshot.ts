#!/usr/bin/env node

import chalk from 'chalk'
import { DescribeSnapshotsCommand, EC2Client } from '@aws-sdk/client-ec2'
import timeAgo from './timeAgo'
import { makeSelector } from './makeSelector'

const selectEBSSnapshot = makeSelector({
  thing: 'EBS Snapshot',
  recentKey: ['selectEBSSnapshot'],
  defaultLimit: 100,
  getClient: (config) => new EC2Client(config),
  getPage: ({ client, search, limit, abortSignal }) =>
    client.send(
      new DescribeSnapshotsCommand({
        ...(search && {
          Filters: [{ Name: 'tag:Name', Values: [`*${search}*`] }],
        }),
        MaxResults: limit,
      }),
      { abortSignal }
    ),
  getItems: (page) => page.Snapshots,
  getId: (item) => item.SnapshotId,
  refetchRecent: ({ client, id, abortSignal }) =>
    client
      .send(new DescribeSnapshotsCommand({ SnapshotIds: [id] }), {
        abortSignal,
      })
      .then((r) => r.Snapshots?.[0]),
  columns: {
    __Name__: {
      get: (i) => i.Tags?.find((t) => t.Key === 'Name')?.Value,
      basis: 1,
    },
    Description: { basis: 2 },
    SnapshotId: { width: 22 },
    State: {
      showRecent: true,
      format: {
        pending: '🔵 Pending',
        completed: '🟢 Completed',
        error: '🔴 Error',
      },
      colors: {
        completed: chalk.green,
        __other__: chalk.gray,
      },
      width: '🟢 Completed'.length,
    },
    StartTime: { format: timeAgo },
  },
})
export default selectEBSSnapshot

if (require.main === module) {
  ;(async () => {
    const { cli } = await import('./cli')
    await cli({
      select: () => selectEBSSnapshot(),
      queries: {
        id: 'SnapshotId',
        vol: 'VolumeId',
      },
    })
  })()
}
