import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { dataService } from '../api/services';
import { EmptyState } from '../components/common/EmptyState';
import { LoadingState } from '../components/common/LoadingState';
import { Panel } from '../components/common/Panel';
import { fmtDateTime, fmtNumber } from '../utils/format';

export const DataHubPage = () => {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [datasetType, setDatasetType] = useState<'AUTO' | 'RATES' | 'NEWS'>('AUTO');
  const [sourceName, setSourceName] = useState('');
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [integrationName, setIntegrationName] = useState('');
  const [selectedIntegrationId, setSelectedIntegrationId] = useState('');
  const [sourceForm, setSourceForm] = useState({
    name: '',
    description: '',
    type: 'EXCHANGE_RATES' as const,
  });

  const importsQuery = useQuery({
    queryKey: ['imports'],
    queryFn: () => dataService.imports.list({ pageSize: 20 }),
  });
  const integrationsQuery = useQuery({
    queryKey: ['whatsapp-integrations'],
    queryFn: () => dataService.whatsapp.listIntegrations({ pageSize: 20 }),
  });
  const forecastsQuery = useQuery({
    queryKey: ['forecasts'],
    queryFn: () => dataService.forecasts.list(),
  });
  const messagesQuery = useQuery({
    queryKey: ['whatsapp-messages', selectedIntegrationId],
    queryFn: () => dataService.whatsapp.listMessages(selectedIntegrationId, { pageSize: 15 }),
    enabled: Boolean(selectedIntegrationId),
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) {
        throw new Error('Choose a CSV or TXT file first.');
      }
      const content = await file.text();
      return dataService.imports.create({
        fileName: file.name,
        content,
        datasetType,
        sourceName: sourceName || undefined,
        retrainAfterImport: true,
      });
    },
    onSuccess: async (response) => {
      setUploadStatus(response.data.notes);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['imports'] }),
        queryClient.invalidateQueries({ queryKey: ['forecasts'] }),
      ]);
    },
    onError: (error: Error) => setUploadStatus(error.message),
  });

  const retrainMutation = useMutation({
    mutationFn: () => dataService.forecasts.retrain(),
    onSuccess: async (response) => {
      setUploadStatus(`Generated ${response.data.items.length} forecast snapshots.`);
      await queryClient.invalidateQueries({ queryKey: ['forecasts'] });
    },
    onError: (error: Error) => setUploadStatus(error.message),
  });

  const integrationMutation = useMutation({
    mutationFn: () => dataService.whatsapp.createIntegration({ name: integrationName }),
    onSuccess: async (response) => {
      setIntegrationName('');
      setSelectedIntegrationId(response.data.id);
      await queryClient.invalidateQueries({ queryKey: ['whatsapp-integrations'] });
    },
  });

  const sourceMutation = useMutation({
    mutationFn: () =>
      dataService.whatsapp.createSource(selectedIntegrationId, {
        name: sourceForm.name,
        description: sourceForm.description || undefined,
        type: sourceForm.type,
      }),
    onSuccess: async () => {
      setSourceForm({ name: '', description: '', type: 'EXCHANGE_RATES' });
      await queryClient.invalidateQueries({ queryKey: ['whatsapp-integrations'] });
    },
  });

  const integrations = integrationsQuery.data?.data.items ?? [];
  const selectedIntegration = integrations.find((item) => item.id === selectedIntegrationId) ?? integrations[0] ?? null;
  const forecastRows = forecastsQuery.data?.data.items ?? [];

  const forecastSummary = useMemo(
    () =>
      forecastRows.map((row) => ({
        ...row,
        delta: Number(row.predictedRate) - Number(row.currentRate),
      })),
    [forecastRows],
  );

  if (importsQuery.isLoading || integrationsQuery.isLoading || forecastsQuery.isLoading) {
    return <LoadingState label="Loading ingestion hub..." />;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Panel title="Import CSV / TXT">
          <div className="space-y-3 text-sm">
            <input
              type="file"
              accept=".csv,.txt"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="block w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs"
            />
            <div className="grid gap-2 md:grid-cols-2">
              <select
                value={datasetType}
                onChange={(event) => setDatasetType(event.target.value as 'AUTO' | 'RATES' | 'NEWS')}
                className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs"
              >
                <option value="AUTO">Auto Detect</option>
                <option value="RATES">Rates</option>
                <option value="NEWS">News</option>
              </select>
              <input
                value={sourceName}
                onChange={(event) => setSourceName(event.target.value)}
                placeholder="Optional source name"
                className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => uploadMutation.mutate()}
                disabled={uploadMutation.isPending}
                className="rounded bg-blue-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
              >
                {uploadMutation.isPending ? 'Importing...' : 'Import File'}
              </button>
              <button
                onClick={() => retrainMutation.mutate()}
                disabled={retrainMutation.isPending}
                className="rounded border border-slate-700 px-3 py-2 text-xs text-slate-200 disabled:opacity-60"
              >
                {retrainMutation.isPending ? 'Training...' : 'Retrain Forecasts'}
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Upload WhatsApp `.txt` exports or structured `.csv` files. The backend stores the parsed rows in the database and refreshes the 24h/48h forecast model.
            </p>
            {uploadStatus ? <div className="rounded border border-emerald-800 bg-emerald-950/40 p-2 text-xs text-emerald-300">{uploadStatus}</div> : null}
          </div>
        </Panel>

        <Panel title="Latest Forecasts">
          {forecastSummary.length ? (
            <div className="space-y-2 text-xs">
              {forecastSummary.map((row) => (
                <div key={row.id} className="flex items-center justify-between rounded border border-slate-800 px-3 py-2">
                  <div>
                    <div className="font-medium text-slate-100">
                      {row.currencyCode}/LYD · {row.horizonHours}h
                    </div>
                    <div className="text-slate-400">
                      Current {fmtNumber(row.currentRate)} → Forecast {fmtNumber(row.predictedRate)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={row.delta >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{row.delta >= 0 ? '+' : ''}{fmtNumber(row.delta)}</div>
                    <div className="text-slate-400">{row.confidenceLabel}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState label="No forecast snapshots yet." />
          )}
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_1.2fr]">
        <Panel title="WhatsApp Integrations">
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                value={integrationName}
                onChange={(event) => setIntegrationName(event.target.value)}
                placeholder="Integration name"
                className="flex-1 rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs"
              />
              <button
                onClick={() => integrationMutation.mutate()}
                disabled={!integrationName || integrationMutation.isPending}
                className="rounded bg-blue-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
              >
                Add Integration
              </button>
            </div>

            <div className="space-y-2">
              {integrations.length ? (
                integrations.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedIntegrationId(item.id)}
                    className={`block w-full rounded border px-3 py-2 text-left text-xs ${
                      selectedIntegration?.id === item.id ? 'border-blue-500 bg-blue-950/30' : 'border-slate-800 bg-slate-950'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-100">{item.name}</span>
                      <span className="text-slate-400">{item.status}</span>
                    </div>
                    <div className="mt-1 text-slate-400">
                      Verify token: <span className="font-mono text-slate-300">{item.verifyToken}</span>
                    </div>
                    <div className="mt-1 text-slate-500">
                      Sources: {item.sources?.length ?? 0} · Messages: {item._count?.messages ?? 0}
                    </div>
                  </button>
                ))
              ) : (
                <EmptyState label="No WhatsApp integrations configured." />
              )}
            </div>
          </div>
        </Panel>

        <Panel title="Channel Sources & Messages">
          {selectedIntegration ? (
            <div className="space-y-4">
              <div className="grid gap-2 md:grid-cols-[1fr_1fr_140px_auto]">
                <input
                  value={sourceForm.name}
                  onChange={(event) => setSourceForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Source or channel name"
                  className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs"
                />
                <input
                  value={sourceForm.description}
                  onChange={(event) => setSourceForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Invite code or description"
                  className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs"
                />
                <select
                  value={sourceForm.type}
                  onChange={(event) =>
                    setSourceForm((current) => ({
                      ...current,
                      type: event.target.value as 'EXCHANGE_RATES' | 'NEWS',
                    }))
                  }
                  className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs"
                >
                  <option value="EXCHANGE_RATES">Exchange Rates</option>
                  <option value="NEWS">News</option>
                </select>
                <button
                  onClick={() => sourceMutation.mutate()}
                  disabled={!sourceForm.name || sourceMutation.isPending}
                  className="rounded border border-slate-700 px-3 py-2 text-xs text-slate-200 disabled:opacity-60"
                >
                  Add Source
                </button>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Configured sources</div>
                  {selectedIntegration.sources?.length ? (
                    selectedIntegration.sources.map((source) => (
                      <div key={source.id} className="rounded border border-slate-800 px-3 py-2 text-xs">
                        <div className="font-medium text-slate-100">{source.name}</div>
                        <div className="text-slate-400">{source.type}</div>
                        {source.description ? <div className="text-slate-500">{source.description}</div> : null}
                      </div>
                    ))
                  ) : (
                    <EmptyState label="No sources linked yet." />
                  )}
                </div>

                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Recent bridge messages</div>
                  {messagesQuery.isLoading ? (
                    <LoadingState label="Loading messages..." />
                  ) : messagesQuery.data?.data.items.length ? (
                    messagesQuery.data.data.items.map((message) => (
                      <div key={message.id} className="rounded border border-slate-800 px-3 py-2 text-xs">
                        <div className="flex items-center justify-between text-slate-300">
                          <span>{message.source?.name ?? 'Unmapped source'}</span>
                          <span>{message.parseStatus}</span>
                        </div>
                        <div className="mt-1 line-clamp-3 text-slate-400">{message.messageText}</div>
                        <div className="mt-1 text-slate-500">{fmtDateTime(message.receivedAt)}</div>
                      </div>
                    ))
                  ) : (
                    <EmptyState label="No live WhatsApp messages yet." />
                  )}
                </div>
              </div>
            </div>
          ) : (
            <EmptyState label="Create or select a WhatsApp integration first." />
          )}
        </Panel>
      </div>

      <Panel title="Import History">
        {importsQuery.data?.data.items.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="text-slate-500">
                <tr>
                  <th className="pb-2 pr-4">File</th>
                  <th className="pb-2 pr-4">Type</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Rows</th>
                  <th className="pb-2 pr-4">Created</th>
                  <th className="pb-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {importsQuery.data.data.items.map((item) => (
                  <tr key={item.id} className="border-t border-slate-900">
                    <td className="py-2 pr-4 text-slate-200">{item.fileName}</td>
                    <td className="py-2 pr-4 text-slate-400">{item.datasetType}</td>
                    <td className="py-2 pr-4 text-slate-400">{item.status}</td>
                    <td className="py-2 pr-4 text-slate-400">{item.recordsImported}</td>
                    <td className="py-2 pr-4 text-slate-400">{fmtDateTime(item.createdAt)}</td>
                    <td className="py-2 text-slate-500">{item.notes ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState label="No imports have been run yet." />
        )}
      </Panel>
    </div>
  );
};
