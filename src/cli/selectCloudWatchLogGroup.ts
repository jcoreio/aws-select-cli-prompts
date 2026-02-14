import selectCloudWatchLogGroup from '../selectCloudWatchLogGroup'
;(async () => {
  const { makeCli: cli } = await import('./makeCli')
  await cli({
    select: () => selectCloudWatchLogGroup(),
    queries: {
      arn: 'arn',
    },
  })
})()
