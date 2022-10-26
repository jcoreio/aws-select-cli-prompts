# @jcoreio/aws-select-cli-prompts

[![CircleCI](https://circleci.com/gh/jcoreio/aws-select-cli-prompts.svg?style=svg)](https://circleci.com/gh/jcoreio/aws-select-cli-prompts)
[![Coverage Status](https://codecov.io/gh/jcoreio/aws-select-cli-prompts/branch/master/graph/badge.svg)](https://codecov.io/gh/jcoreio/aws-select-cli-prompts)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)
[![npm version](https://badge.fury.io/js/%40jcoreio%2Faws-select-cli-prompts.svg)](https://badge.fury.io/js/%40jcoreio%2Faws-select-cli-prompts)

CLI prompts to select AWS resources via aws-sdk

# Installation

```js
npm i --save @jcoreio/aws-select-cli-prompts
```

# API

## selectEC2Instance

```js
import { selectEC2Instance } from '@jcoreio/aws-select-cli-prompts'
```

Prompts the user to select an EC2 Instance. Returns a promise that resolves to the selected
`AWS.EC2.Instance`.

### Options

#### `ec2?: AWS.EC2 = new AWS.EC2()`

The EC2 API instance to use.

#### `Filters?: AWS.EC2.DescribeInstancesRequest['Filters'] = []`

Additional filters to use.

#### `MaxResults?: number = 100`

The maximum number of EC2 instances to fetch.

#### `useRecents?: boolean = true`

If `true`, load recent instances the user has selected in the past (from `~/.aws-select-cli-prompts/recents.json`)
and present them when the filter text is empty. After the user makes a selection it will be saved tot he recents
file.

## selectEBSSnapshot

```js
import { selectEBSSnapshot } from '@jcoreio/aws-select-cli-prompts'
```

Prompts the user to select an EBS Snapshot. Returns a promise that resolves to the selected
`AWS.EC2.Snapshot`.

### Options

#### `ec2?: AWS.EC2 = new AWS.EC2()`

The EC2 API instance to use.

#### `Filters?: AWS.EC2.DescribeSnapshotsRequest['Filters'] = []`

Additional filters to use.

#### `MaxResults?: number = 100`

The maximum number of snapshots to fetch.

#### `useRecents?: boolean = true`

If `true`, load recent instances the user has selected in the past (from `~/.aws-select-cli-prompts/recents.json`)
and present them when the filter text is empty. After the user makes a selection it will be saved tot he recents
file.
