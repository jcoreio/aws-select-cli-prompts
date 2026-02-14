import selectRoute53HostedZone from '../selectRoute53HostedZone'
void (async () => {
  const { makeCli: cli } = await import('./makeCli')
  await cli({
    select: () => selectRoute53HostedZone(),
    queries: {
      id: 'HostedZoneId',
    },
  })
})()
