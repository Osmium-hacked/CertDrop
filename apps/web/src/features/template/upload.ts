import {
  TemplateCompleteResponseSchema,
  TemplateUploadResponseSchema,
  type Template,
  type TemplateMimeType,
} from '@certdrop/shared';
import { api, ApiRequestError } from '../../lib/api';

/**
 * PUT with progress events. fetch() can't report upload progress, so this is the one place the
 * app uses XMLHttpRequest. The request goes straight to object storage, not to the API.
 */
function putWithProgress(
  url: string,
  headers: Record<string, string>,
  file: File,
  onProgress: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(
            new ApiRequestError(xhr.status, 'UPLOAD_FAILED', 'The upload was rejected. Please try again.'),
          );
    xhr.onerror = () =>
      reject(new ApiRequestError(0, 'NETWORK', 'The upload failed. Check your connection and try again.'));
    xhr.send(file);
  });
}

export type UploadPhase = 'uploading' | 'checking';

/** Presign → direct upload → server-side verification. Resolves with the verified template. */
export async function uploadTemplate(
  file: File,
  type: TemplateMimeType,
  onProgress: (phase: UploadPhase, fraction: number) => void,
): Promise<Template> {
  const upload = await api('/uploads/template', TemplateUploadResponseSchema, {
    method: 'POST',
    body: { contentType: type, sizeBytes: file.size },
  });
  await putWithProgress(upload.uploadUrl, upload.headers, file, (f) => onProgress('uploading', f));
  onProgress('checking', 1);
  const { template } = await api(
    `/uploads/template/${upload.templateId}/complete`,
    TemplateCompleteResponseSchema,
    {
      method: 'POST',
    },
  );
  return template;
}
