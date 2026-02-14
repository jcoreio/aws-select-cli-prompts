import selectSecretsManagerSecret from '../selectSecretsManagerSecret'
;(async () => {
  const { makeCli: cli } = await import('./makeCli')
  await cli({
    select: () => selectSecretsManagerSecret(),
    queries: {
      arn: 'ARN',
    },
  })
})()
