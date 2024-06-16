import {
  Route53Client,
  ListHostedZonesCommand,
  GetHostedZoneCommand,
} from '@aws-sdk/client-route-53'
import { makeSelector } from './makeSelector'

const selectRoute53HostedZone = makeSelector({
  thing: 'Route53 Hosted Zone',
  recentKey: ['selectRoute53HostedZone'],
  defaultLimit: 100,
  getClient: (config) => new Route53Client(config),
  getPage: ({ client, limit, abortSignal }) =>
    client.send(
      new ListHostedZonesCommand({
        MaxItems: limit,
      }),
      { abortSignal }
    ),
  getItems: (page) => page.HostedZones,
  getId: (item) => item.Id?.replace(/\/hostedzone\//, ''),
  refetchRecent: ({ client, id, abortSignal }) =>
    client
      .send(
        new GetHostedZoneCommand({
          Id: id,
        }),
        { abortSignal }
      )
      .then((r) => r.HostedZone),
  getSearchText: (item) => item.Name,
  columns: {
    __PublicPrivate__: {
      get: (item) => (item.Config?.PrivateZone ? 'Private' : 'Public'),
      width: 'Private'.length,
    },
    Name: {},
    Id: {},
  },
})
export default selectRoute53HostedZone

if (require.main === module) {
  ;(async () => {
    const { cli } = await import('./cli')
    await cli({
      select: () => selectRoute53HostedZone(),
      queries: {
        id: 'HostedZoneId',
      },
    })
  })()
}
