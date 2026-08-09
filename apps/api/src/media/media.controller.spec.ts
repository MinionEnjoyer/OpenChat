import { PassThrough, Readable } from 'stream';
import { once } from 'events';
import { MediaController } from './media.controller';

describe('MediaController proxy response wiring', () => {
  function responseHarness() {
    const response = new PassThrough() as PassThrough & {
      status: jest.Mock;
      setHeader: jest.Mock;
    };
    response.status = jest.fn().mockReturnValue(response);
    response.setHeader = jest.fn();
    return response;
  }

  it('passes the requested range, status, headers, and stream to Express', async () => {
    const share = {
      proxyRaw: jest.fn().mockResolvedValue({
        stream: Readable.from(Buffer.from('partial')),
        headers: {
          'content-type': 'application/octet-stream',
          'content-range': 'bytes 0-6/20',
        },
        status: 206,
      }),
    };
    const controller = new MediaController(share as never);
    const response = responseHarness();
    const chunks: Buffer[] = [];
    response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));

    await controller.proxyRaw(
      'asset-1',
      { headers: { range: 'bytes=0-6' } } as never,
      response as never,
    );
    await once(response, 'finish');

    expect(share.proxyRaw).toHaveBeenCalledWith('asset-1', 'bytes=0-6');
    expect(response.status).toHaveBeenCalledWith(206);
    expect(response.setHeader).toHaveBeenCalledWith('content-type', 'application/octet-stream');
    expect(response.setHeader).toHaveBeenCalledWith('content-range', 'bytes 0-6/20');
    expect(Buffer.concat(chunks).toString()).toBe('partial');
  });

  it('pipes thumbnail responses through the same controlled response path', async () => {
    const share = {
      proxyThumb: jest.fn().mockResolvedValue({
        stream: Readable.from(Buffer.from('thumbnail')),
        headers: { 'content-type': 'image/jpeg' },
        status: 200,
      }),
    };
    const controller = new MediaController(share as never);
    const response = responseHarness();

    await controller.proxyThumb('asset-2', response as never);
    await once(response, 'finish');

    expect(share.proxyThumb).toHaveBeenCalledWith('asset-2');
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.setHeader).toHaveBeenCalledWith('content-type', 'image/jpeg');
  });
});
