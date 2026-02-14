import selectCloudWatchLogGroup from '../selectCloudWatchLogGroup'
void (async () => {
  const { makeCli: cli } = await import('./makeCli')
  await cli({
    select: () => selectCloudWatchLogGroup(),
    queries: {
      arn: 'arn',
    },
  })
})()
