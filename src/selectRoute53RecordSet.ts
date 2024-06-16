import {
  Route53Client,
  ListResourceRecordSetsCommand,
} from '@aws-sdk/client-route-53'
import { makeSelector } from './makeSelector'
import selectRoute53HostedZone from './selectRoute53HostedZone'

const selectRoute53RecordSet = makeSelector({
  thing: 'Route53 Record Set',
  recentKey: ({ HostedZoneId }) => [
    'selectRoute53RecordSet',
    HostedZoneId || '',
  ],
  defaultLimit: 100,
  getClient: (config) => new Route53Client(config),
  getOtherOptions: async (o: any) => ({
    HostedZoneId: o.HostedZoneId || (await selectRoute53HostedZone(o)).Id,
  }),
  getPage: ({ client, limit, abortSignal, otherOptions }) =>
    client.send(
      new ListResourceRecordSetsCommand({
        HostedZoneId: otherOptions.HostedZoneId,
        MaxItems: limit,
      }),
      { abortSignal }
    ),
  getItems: (page) => page.ResourceRecordSets,
  getId: (item) => JSON.stringify([item.Name, item.Type]),
  refetchRecent: ({ client, id, otherOptions, abortSignal }) =>
    client
      .send(
        new ListResourceRecordSetsCommand({
          HostedZoneId: otherOptions.HostedZoneId,
          StartRecordName: JSON.parse(id)[0],
          StartRecordType: JSON.parse(id)[1],
          MaxItems: 1,
        }),
        { abortSignal }
      )
      .then((r) =>
        r.ResourceRecordSets?.[0]?.Name === id
          ? r.ResourceRecordSets[0]
          : undefined
      ),
  getSearchText: ({ Name, AliasTarget, ResourceRecords }) =>
    `${Name} ${
      AliasTarget?.DNSName ?? ResourceRecords?.map((r) => r.Value).join(' ')
    }`,
  columns: {
    Name: {},
    Type: { width: 5 },
    __Alias__: {
      get: (item) => (item.AliasTarget ? 'Alias: Yes' : 'Alias: No'),
      width: 'Alias: Yes'.length,
    },
    TTL: {
      format: (ttl: number | undefined) => `TTL: ${ttl || ''}`,
      width: 12,
    },
    __Target__: {
      get: (item) =>
        item.AliasTarget
          ? item.AliasTarget.DNSName
          : item.ResourceRecords?.map((r) => r.Value).join(' | '),
    },
  },
})
export default selectRoute53RecordSet

if (require.main === module) {
  ;(async () => {
    const { cli } = await import('./cli')
    await cli({
      select: () => selectRoute53RecordSet({ HostedZoneId: process.argv[2] }),
    })
  })()
}
