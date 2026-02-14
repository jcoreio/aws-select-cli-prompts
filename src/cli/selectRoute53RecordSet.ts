import selectRoute53RecordSet from '../selectRoute53RecordSet'
;(async () => {
  const { makeCli: cli } = await import('./makeCli')
  await cli({
    select: () => selectRoute53RecordSet({ HostedZoneId: process.argv[2] }),
  })
})()
