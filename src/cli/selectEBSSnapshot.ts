import selectEBSSnapshot from '../selectEBSSnapshot'
void (async () => {
  const { makeCli: cli } = await import('./makeCli')
  await cli({
    select: () => selectEBSSnapshot(),
    queries: {
      id: 'SnapshotId',
      vol: 'VolumeId',
    },
  })
})()
