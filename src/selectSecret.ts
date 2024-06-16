import {
  SecretsManagerClient,
  ListSecretsCommand,
  DescribeSecretCommand,
} from '@aws-sdk/client-secrets-manager'
import { makeSelector } from './makeSelector'
import timeAgo from './timeAgo'

const selectSecret = makeSelector({
  thing: 'Secrets Manager Secret',
  recentKey: ['secretsManagerSecret'],
  getClient: (config) => new SecretsManagerClient(config),
  getPage: ({ client, limit, search, abortSignal }) =>
    client.send(
      new ListSecretsCommand({
        ...(search && { Filters: [{ Key: 'name', Values: [search] }] }),
        MaxResults: limit,
      }),
      { abortSignal }
    ),
  getItems: (page) => page.SecretList,
  getId: (secret) => secret.ARN,
  refetchRecent: ({ client, id, abortSignal }) =>
    client.send(
      new DescribeSecretCommand({
        SecretId: id,
      }),
      { abortSignal }
    ),
  columns: {
    Name: {},
    LastAccessedDate: {
      format: timeAgo,
    },
  },
})
export default selectSecret

if (require.main === module) {
  ;(async () => {
    const { cli } = await import('./cli')
    await cli({
      select: () => selectSecret(),
      queries: {
        arn: 'ARN',
      },
    })
  })()
}
