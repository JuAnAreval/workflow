import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import { ApiOkResponse, ApiParam, ApiTags } from '@nestjs/swagger';
import { WorkflowsService } from './workflows.service';

@ApiTags('Workflow Webhooks')
@Controller({
  path: 'workflows/webhook',
  version: '1',
})
export class WorkflowWebhooksController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Post(':token')
  @ApiParam({
    name: 'token',
    type: String,
    required: true,
    description: 'Token unico del trigger webhook del workflow.',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        executed: { type: 'boolean', example: true },
        workflowIds: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },
  })
  @HttpCode(HttpStatus.OK)
  executeWebhook(
    @Param('token') token: string,
    @Body() body: unknown,
    @Query() query: Record<string, unknown>,
    @Request() request,
  ) {
    const headersRaw = request?.headers;
    const headers =
      headersRaw && typeof headersRaw === 'object' ? headersRaw : {};

    return this.workflowsService.executeWebhook(token, {
      method:
        typeof request?.method === 'string'
          ? request.method.trim().toUpperCase()
          : 'POST',
      headers,
      query: query ?? {},
      body,
      ip: typeof request?.ip === 'string' ? request.ip : null,
      userAgent:
        typeof headers['user-agent'] === 'string' ? headers['user-agent'] : null,
    });
  }
}
