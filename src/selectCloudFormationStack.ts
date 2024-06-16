import {
  CloudFormationClient,
  DescribeStacksCommand,
} from '@aws-sdk/client-cloudformation'
import { makeSelector } from './makeSelector'
import chalk from 'chalk'
import timeAgo from './timeAgo'

const selectCloudFormationStack = makeSelector({
  thing: 'CloudFormation Stack',
  recentKey: ['cloudFormationStack'],
  getClient: (config) => new CloudFormationClient(config),
  getPage: ({ client, abortSignal }) =>
    client.send(new DescribeStacksCommand({}), { abortSignal }),
  getItems: (page) => page.Stacks,
  getId: (stack) => stack.StackId,
  getSearchText: (stack) => stack.StackName,
  refetchRecent: ({ client, item: { StackName }, abortSignal }) =>
    client
      .send(new DescribeStacksCommand({ StackName }), { abortSignal })
      .then((r) => r.Stacks?.[0]),
  columns: {
    StackName: {},
    StackStatus: {
      minWidth: 'UPDATE_ROLLBACK_FAILED'.length,
      colors: {
        CREATE_COMPLETE: chalk.green,
        CREATE_FAILED: chalk.red,
        CREATE_IN_PROGRESS: chalk.blue,
        DELETE_COMPLETE: chalk.gray,
        DELETE_FAILED: chalk.red,
        DELETE_IN_PROGRESS: chalk.blue,
        IMPORT_COMPLETE: chalk.green,
        IMPORT_IN_PROGRESS: chalk.blue,
        IMPORT_ROLLBACK_COMPLETE: chalk.red,
        IMPORT_ROLLBACK_FAILED: chalk.red,
        IMPORT_ROLLBACK_IN_PROGRESS: chalk.red,
        REVIEW_IN_PROGRESS: chalk.blue,
        ROLLBACK_COMPLETE: chalk.red,
        ROLLBACK_FAILED: chalk.red,
        ROLLBACK_IN_PROGRESS: chalk.red,
        UPDATE_COMPLETE: chalk.green,
        UPDATE_COMPLETE_CLEANUP_IN_PROGRESS: chalk.green,
        UPDATE_FAILED: chalk.red,
        UPDATE_IN_PROGRESS: chalk.blue,
        UPDATE_ROLLBACK_COMPLETE: chalk.red,
        UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS: chalk.red,
        UPDATE_ROLLBACK_FAILED: chalk.red,
        UPDATE_ROLLBACK_IN_PROGRESS: chalk.red,
      },
    },
    LastUpdatedTime: { format: timeAgo },
    Description: {},
  },
})

export default selectCloudFormationStack

if (require.main === module) {
  ;(async () => {
    const { cli } = await import('./cli')
    await cli({
      select: () => selectCloudFormationStack(),
      queries: {
        stackName: 'StackName',
      },
    })
  })()
}
