import selectCloudWatchLogEvent from '../selectCloudWatchLogEvent'
;(async () => {
  const { makeCli: cli } = await import('./makeCli')
  await cli({
    select: (args) => selectCloudWatchLogEvent(args),
    queries: {
      arn: 'arn',
    },
  })
})()
