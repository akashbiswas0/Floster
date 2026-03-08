const abiField = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1 },
    type: { type: 'string', minLength: 1 },
  },
  required: ['name', 'type'],
  additionalProperties: false,
} as const

const triggerNode = {
  oneOf: [
    {
      type: 'object',
      properties: {
        id: { type: 'string', minLength: 1 },
        name: { type: 'string', minLength: 1 },
        type: { const: 'cron' },
        schedule: { type: 'string', minLength: 1 },
      },
      required: ['id', 'name', 'type', 'schedule'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        id: { type: 'string', minLength: 1 },
        name: { type: 'string', minLength: 1 },
        type: { const: 'http' },
        authMode: { enum: ['none', 'jwt'] },
      },
      required: ['id', 'name', 'type'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        id: { type: 'string', minLength: 1 },
        name: { type: 'string', minLength: 1 },
        type: { const: 'evmLog' },
        chainName: { type: 'string', minLength: 1 },
        addresses: {
          type: 'array',
          minItems: 1,
          maxItems: 5,
          items: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
        },
        eventSignature: { type: 'string', minLength: 1 },
      },
      required: ['id', 'name', 'type', 'chainName', 'addresses'],
      additionalProperties: false,
    },
  ],
} as const

const actionNode = {
  oneOf: [
    {
      type: 'object',
      properties: {
        id: { type: 'string', minLength: 1 },
        name: { type: 'string', minLength: 1 },
        type: { const: 'httpFetch' },
        method: { enum: ['GET', 'POST'] },
        url: { type: 'string', minLength: 1 },
        headers: {
          type: 'object',
          nullable: true,
          additionalProperties: { type: 'string' },
          required: [],
        },
        bodyTemplate: { type: 'string', nullable: true },
        consensus: { enum: ['identical', 'median'] },
      },
      required: ['id', 'name', 'type', 'method', 'url', 'consensus'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        id: { type: 'string', minLength: 1 },
        name: { type: 'string', minLength: 1 },
        type: { const: 'evmRead' },
        chainName: { type: 'string', minLength: 1 },
        contractAddress: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
        functionName: { type: 'string', minLength: 1 },
        inputs: { type: 'array', items: abiField },
        outputs: { type: 'array', items: abiField, minItems: 1 },
        args: { type: 'array', nullable: true, items: { type: 'string' } },
        consensus: { enum: ['identical', 'median'] },
      },
      required: [
        'id',
        'name',
        'type',
        'chainName',
        'contractAddress',
        'functionName',
        'inputs',
        'outputs',
        'consensus',
      ],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        id: { type: 'string', minLength: 1 },
        name: { type: 'string', minLength: 1 },
        type: { const: 'evmWrite' },
        chainName: { type: 'string', minLength: 1 },
        receiver: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
        payloadPath: { type: 'string', minLength: 2 },
        gasLimit: { type: 'integer', minimum: 1, maximum: 5000000 },
      },
      required: ['id', 'name', 'type', 'chainName', 'receiver', 'payloadPath', 'gasLimit'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        id: { type: 'string', minLength: 1 },
        name: { type: 'string', minLength: 1 },
        type: { const: 'erc20Transfer' },
        tokenAddress: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
        chainName: { type: 'string', minLength: 1 },
        receiverContract: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
        recipientAddress: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
        tokenDecimals: { type: 'integer', minimum: 0, maximum: 36 },
        amountPath: { type: 'string', minLength: 2 },
        gasLimit: { type: 'integer', minimum: 1, maximum: 5000000 },
      },
      required: [
        'id',
        'name',
        'type',
        'tokenAddress',
        'chainName',
        'receiverContract',
        'recipientAddress',
        'tokenDecimals',
        'amountPath',
        'gasLimit',
      ],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        id: { type: 'string', minLength: 1 },
        name: { type: 'string', minLength: 1 },
        type: { const: 'transform' },
        template: {
          type: 'object',
          additionalProperties: { type: 'string' },
          required: [],
        },
        llmDriven: { type: 'boolean', nullable: true },
        outputSchema: {
          type: 'object',
          nullable: true,
          additionalProperties: {
            enum: ['string', 'number', 'boolean', 'object', 'array'],
          },
          required: [],
        },
      },
      required: ['id', 'name', 'type', 'template'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        id: { type: 'string', minLength: 1 },
        name: { type: 'string', minLength: 1 },
        type: { const: 'consensus' },
        strategy: { enum: ['identical', 'median', 'fields'] },
        fields: {
          type: 'object',
          nullable: true,
          additionalProperties: { enum: ['identical', 'median'] },
          required: [],
        },
      },
      required: ['id', 'name', 'type', 'strategy'],
      additionalProperties: false,
    },
  ],
} as const

export const workflowIRSchema = {
  type: 'object',
  properties: {
    irVersion: { const: '1.0' },
    metadata: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1 },
        description: { type: 'string', nullable: true },
      },
      required: ['name'],
      additionalProperties: false,
    },
    runtime: {
      type: 'object',
      properties: {
        defaultTarget: { type: 'string', minLength: 1 },
        targets: {
          type: 'object',
          minProperties: 1,
          additionalProperties: {
            type: 'object',
            properties: {
              workflowOwnerAddress: {
                type: 'string',
                nullable: true,
                pattern: '^0x[a-fA-F0-9]{40}$',
              },
              broadcast: { type: 'boolean', nullable: true },
              receiverContract: {
                type: 'string',
                nullable: true,
                pattern: '^0x[a-fA-F0-9]{40}$',
              },
              chainExplorerTxBaseUrl: {
                type: 'string',
                nullable: true,
                format: 'uri',
              },
              rpcs: {
                type: 'array',
                minItems: 1,
                items: {
                  type: 'object',
                  properties: {
                    chainName: { type: 'string', minLength: 1 },
                    url: { type: 'string', format: 'uri' },
                  },
                  required: ['chainName', 'url'],
                  additionalProperties: false,
                },
              },
            },
            required: ['rpcs'],
            additionalProperties: false,
          },
          required: [],
        },
      },
      required: ['defaultTarget', 'targets'],
      additionalProperties: false,
    },
    triggers: {
      type: 'array',
      minItems: 1,
      maxItems: 10,
      items: triggerNode,
    },
    actions: {
      type: 'array',
      items: actionNode,
    },
    edges: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          from: { type: 'string', minLength: 1 },
          to: { type: 'string', minLength: 1 },
        },
        required: ['from', 'to'],
        additionalProperties: false,
      },
    },
    secrets: {
      type: 'object',
      nullable: true,
      properties: {
        secretsNames: {
          type: 'object',
          additionalProperties: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
          },
          required: [],
        },
      },
      required: ['secretsNames'],
      additionalProperties: false,
    },
  },
  required: ['irVersion', 'metadata', 'runtime', 'triggers', 'actions', 'edges'],
  additionalProperties: false,
} as const
