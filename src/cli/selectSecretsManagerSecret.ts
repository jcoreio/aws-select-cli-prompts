import selectSecretsManagerSecret from '../selectSecretsManagerSecret'
void (async () => {
  const { makeCli: cli } = await import('./makeCli')
  await cli({
    select: () => selectSecretsManagerSecret(),
    queries: {
      arn: 'ARN',
    },
  })
})()
