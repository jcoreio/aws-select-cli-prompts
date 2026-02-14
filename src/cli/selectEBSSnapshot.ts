import selectEBSSnapshot from '../selectEBSSnapshot'
;(async () => {
  const { makeCli: cli } = await import('./makeCli')
  await cli({
    select: () => selectEBSSnapshot(),
    queries: {
      id: 'SnapshotId',
      vol: 'VolumeId',
    },
  })
})()
