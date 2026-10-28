import { ArgumentsHost } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaExceptionFilter } from './prisma-exception.filter';

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('erro', {
    code,
    clientVersion: 'test',
  });
}

describe('PrismaExceptionFilter', () => {
  const filter = new PrismaExceptionFilter();
  let status: jest.Mock;
  let json: jest.Mock;
  let host: ArgumentsHost;

  beforeEach(() => {
    json = jest.fn();
    status = jest.fn().mockReturnValue({ json });
    host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as unknown as ArgumentsHost;
  });

  it.each([
    ['P2002', 409],
    ['P2003', 409],
    ['P2025', 404],
    ['P9999', 500],
  ])('traduz %s para HTTP %i', (code, expected) => {
    filter.catch(prismaError(code), host);

    expect(status).toHaveBeenCalledWith(expected);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: expected, code }),
    );
  });
});
