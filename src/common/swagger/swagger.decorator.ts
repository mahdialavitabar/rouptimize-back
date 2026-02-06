import { applyDecorators, Type } from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

interface ApiResponseDoc {
  status: number;
  description: string;
  type?: Type<unknown>;
  isArray?: boolean;
}

interface ApiHeaderDoc {
  name: string;
  description: string;
  example?: string;
  required?: boolean;
}

interface ApiQueryDoc {
  name: string;
  description: string;
  example?: any;
  required?: boolean;
}

interface ApiParamDoc {
  name: string;
  description: string;
  example?: any;
  required?: boolean;
}

interface CreateSwaggerDocOptions {
  summary: string;
  description?: string;
  bodyType?: Type<unknown>;
  responses: ApiResponseDoc[];
  headers?: ApiHeaderDoc[];
  queries?: ApiQueryDoc[];
  pagination?: boolean;
  params?: ApiParamDoc[];
  examples?: Record<string, any>;
  tags?: string[];
}

export function CreateSwaggerDoc(options: CreateSwaggerDocOptions) {
  const {
    summary,
    description,
    bodyType,
    responses,
    headers = [],
    queries = [],
    pagination = false,
    params = [],
    examples = {},
    tags = [],
  } = options;

  const decorators = [
    ApiOperation({ summary, description, ...(Object.keys(examples).length && { examples }) }),

    ...responses.map(res =>
      ApiResponse({
        status: res.status,
        description: res.description,
        ...(res.type && { type: res.type }),
        ...(res.isArray && { isArray: true }),
      }),
    ),

    ...headers.map(h =>
      ApiHeader({
        name: h.name,
        description: h.description,
        example: h.example,
        required: h.required ?? false,
      }),
    ),

    ...queries.map(q =>
      ApiQuery({
        name: q.name,
        description: q.description,
        example: q.example,
        required: q.required ?? false,
      }),
    ),

    ...params.map(p =>
      ApiParam({
        name: p.name,
        description: p.description,
        example: p.example,
        required: p.required ?? false,
      }),
    ),
  ];

  if (bodyType) {
    decorators.push(ApiBody({ type: bodyType }));
  }

  if (pagination) {
    decorators.push(
      ApiQuery({
        name: 'page',
        required: false,
        description: 'Page number',
      }),
      ApiQuery({
        name: 'limit',
        required: false,
        description: 'Items per page',
      }),
    );
  }
  decorators.push(
    ApiHeader({
      name: 'Accept-Language',
      required: false,
      description: 'Language preference (e.g., en, vi)',
    }),
  );

  if (tags.length) {
    decorators.push(ApiTags(...tags));
  }

  return applyDecorators(...decorators);
}
