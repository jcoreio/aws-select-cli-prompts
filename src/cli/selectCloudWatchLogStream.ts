import selectCloudWatchLogStream from '../selectCloudWatchLogStream'
;(async () => {
  const { makeCli: cli } = await import('./makeCli')
  await cli({
    select: (args) => selectCloudWatchLogStream(args),
    queries: {
      arn: 'arn',
    },
  })
})()
