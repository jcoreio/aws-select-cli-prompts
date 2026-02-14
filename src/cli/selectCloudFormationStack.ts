import selectCloudFormationStack from '../selectCloudFormationStack'
;(async () => {
  const { makeCli: cli } = await import('./makeCli')
  await cli({
    select: () => selectCloudFormationStack(),
    queries: {
      stackId: 'StackId',
      stackName: 'StackName',
    },
  })
})()
