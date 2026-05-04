import { Group, Text, rem, Stack, Paper, Title, Alert } from '@mantine/core';
import { Upload, FileCode, X } from 'lucide-react';
import { Dropzone } from '@mantine/dropzone';
import { dataApi } from '../../api';
import { useState } from 'react';
import { notifications } from '@mantine/notifications';

export function CimUpload() {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (files: File[]) => {
    const file = files[0];
    if (!file) return;

    setUploading(true);
    try {
      const result = await dataApi.upload(file);
      if (result.success) {
        notifications.show({
          title: 'Upload Successful',
          message: result.message,
          color: 'green',
        });
      } else {
        throw new Error(result.message || 'Upload failed');
      }
    } catch (err: any) {
      notifications.show({
        title: 'Upload Failed',
        message: err.message,
        color: 'red',
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="xs">
        <Title order={5}>Upload CIM XML</Title>
        <Alert title="Automatic Ingestion" color="blue" icon={<Upload size={16} />}>
          Drop a CIM XML file here to automatically queue it for processing. The system continuously monitors the ingest folder and handles parsing, neo4j loading, and spatial data generation in the background.
        </Alert>
        <Dropzone
          onDrop={handleUpload}
          onReject={(files) => {
            notifications.show({
              title: 'File Rejected',
              message: files[0]?.errors[0]?.message || 'Invalid file',
              color: 'red',
            });
          }}
          maxSize={100 * 1024 ** 2}
          multiple={false}
          loading={uploading}
          accept={['text/xml', 'application/xml']}
        >
          <Group justify="center" gap="xl" mih={120} style={{ pointerEvents: 'none' }}>
            <Dropzone.Accept>
              <Upload
                style={{ width: rem(52), height: rem(52), color: 'var(--mantine-color-blue-6)' }}
              />
            </Dropzone.Accept>
            <Dropzone.Reject>
              <X
                style={{ width: rem(52), height: rem(52), color: 'var(--mantine-color-red-6)' }}
              />
            </Dropzone.Reject>
            <Dropzone.Idle>
              <FileCode
                style={{ width: rem(52), height: rem(52), color: 'var(--mantine-color-dimmed)' }}
              />
            </Dropzone.Idle>

            <div>
              <Text size="xl" inline>
                Drag XML file here or click to select
              </Text>
              <Text size="sm" c="dimmed" inline mt={7}>
                Attach a single .xml file, should not exceed 100MB
              </Text>
            </div>
          </Group>
        </Dropzone>
      </Stack>
    </Paper>
  );
}
