import { HttpException, HttpStatus } from '@nestjs/common';
import { existsSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { UploadsController } from './uploads.controller';

describe('UploadsController spool cleanup and delegation', () => {
  const user = { id: 'user-1' } as never;

  function spool(name = 'upload.bin') {
    const path = join(mkdtempSync(join(tmpdir(), 'openchat-upload-controller-')), name);
    writeFileSync(path, 'fixture');
    return {
      originalname: name,
      path,
      mimetype: 'application/octet-stream',
      size: 7,
    };
  }

  it('rejects an empty multipart submission before calling OpenShare', async () => {
    const share = { uploadForUser: jest.fn() };
    const controller = new UploadsController(share as never);

    await expect(controller.upload([], user)).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      response: 'No files provided',
    });
    expect(share.uploadForUser).not.toHaveBeenCalled();
  });

  it('delegates normalized spool metadata and removes the spool after success', async () => {
    const file = spool('note.txt');
    const result = { attachments: [{ id: 'asset-1' }], rejected: [] };
    const share = { uploadForUser: jest.fn().mockResolvedValue(result) };
    const controller = new UploadsController(share as never);

    await expect(controller.upload([file], user)).resolves.toBe(result);
    expect(share.uploadForUser).toHaveBeenCalledWith('user-1', [{
      originalname: 'note.txt',
      path: file.path,
      mimetype: 'application/octet-stream',
      size: 7,
    }]);
    expect(existsSync(file.path)).toBe(false);
  });

  it('removes every spool when OpenShare rejects an upload', async () => {
    const files = [spool('one.bin'), spool('two.bin')];
    const share = {
      uploadForUser: jest.fn().mockRejectedValue(
        new HttpException('upstream failed', HttpStatus.BAD_GATEWAY),
      ),
    };
    const controller = new UploadsController(share as never);

    await expect(controller.upload(files, user)).rejects.toMatchObject({
      status: HttpStatus.BAD_GATEWAY,
    });
    expect(files.every((file) => !existsSync(file.path))).toBe(true);
  });

  it('rejects missing waveform files without calling OpenShare', async () => {
    const share = { analyzeWaveformForUser: jest.fn() };
    const controller = new UploadsController(share as never);

    await expect(controller.waveform(undefined, user)).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      response: 'No file provided',
    });
    expect(share.analyzeWaveformForUser).not.toHaveBeenCalled();
  });

  it('removes a waveform spool after both success and failure', async () => {
    const successFile = spool('success.wav');
    const failureFile = spool('failure.wav');
    const share = {
      analyzeWaveformForUser: jest.fn()
        .mockResolvedValueOnce({ peaks: [0, 50, 100], duration: 0.5 })
        .mockRejectedValueOnce(new Error('processor unavailable')),
    };
    const controller = new UploadsController(share as never);

    await expect(controller.waveform(successFile, user)).resolves.toEqual({
      peaks: [0, 50, 100],
      duration: 0.5,
    });
    await expect(controller.waveform(failureFile, user)).rejects.toThrow('processor unavailable');
    expect(existsSync(successFile.path)).toBe(false);
    expect(existsSync(failureFile.path)).toBe(false);
  });
});
