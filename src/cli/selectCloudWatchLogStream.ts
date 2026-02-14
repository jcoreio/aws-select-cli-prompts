import selectCloudWatchLogStream from '../selectCloudWatchLogStream'
void (async () => {
  const { makeCli: cli } = await import('./makeCli')
  await cli({
    select: (args) => selectCloudWatchLogStream(args),
    queries: {
      arn: 'arn',
    },
  })
})()
