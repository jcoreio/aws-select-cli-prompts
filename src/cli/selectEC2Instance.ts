import selectEC2Instance from '../selectEC2Instance'
void (async () => {
  const { makeCli: cli } = await import('./makeCli')
  await cli({
    select: () => selectEC2Instance(),
    queries: {
      id: 'InstanceId',
      'pub-ip': 'PublicIpAddress',
      'pub-dns': 'PublicDnsName',
      'priv-ip': 'PrivateIpAddress',
      'priv-dns': 'PrivateDnsName',
    },
  })
})()
