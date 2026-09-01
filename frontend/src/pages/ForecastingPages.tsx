import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { dataService } from '../api/services';
import { Panel } from '../components/common/Panel';
import { LoadingState } from '../components/common/LoadingState';
import { EmptyState } from '../components/common/EmptyState';
import { RateChart } from '../components/dashboard/RateChart';
import { fmtDateTime, fmtNumber } from '../utils/format';

const readFileText = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });

export const IngestionPage = () => {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<'rates' | 'news'>('rates');
  const [format, setFormat] = useState<'csv' | 'txt'>('txt');
  const [integrationId, setIntegrationId] = useState('');
  const [channelName, setChannelName] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  const integrationsQuery = useQuery({ queryKey: ['wa-integrations'], queryFn: () => dataService.whatsapp.listIntegrations() });

  const importMutation = useMutation({
    mutationFn: (payload: { fileName: string; format: 'csv' | 'txt'; kind: 'rates' | 'news'; content: string }) =>
      dataService.forecasting.importFile(payload),
  });

  const trainMutation = useMutation({
    mutationFn: () => dataService.forecasting.train(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['forecast-runs'] }),
  });

  const createIntegrationMutation = useMutation({
    mutationFn: () =>
      dataService.whatsapp.createIntegration({
        name: 'WhatsApp Connector',
        businessAccountId: 'replace-with-id',
        phoneNumberId: 'replace-with-phone-id',
        encryptedAccessToken: 'replace-with-token',
        verifyToken: 'replace-with-verify-token',
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wa-integrations'] }),
  });

  const createSourceMutation = useMutation({
    mutationFn: () =>
      dataService.whatsapp.addSource(integrationId, {
        name: channelName,
        inviteCode,
        type: kind === 'rates' ? 'EXCHANGE_RATES' : 'NEWS',
        active: true,
        syncEnabled: true,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wa-integrations'] }),
  });

  const connectMutation = useMutation({
    mutationFn: () => dataService.whatsapp.connectIntegration(integrationId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wa-integrations'] }),
  });

  return (
    <div className="space-y-3">
      <Panel title="Import CSV/TXT for training">
        <div className="grid gap-2 text-xs md:grid-cols-4">
          <select className="rounded border border-slate-700 bg-slate-950 px-2 py-1" value={kind} onChange={(e) => setKind(e.target.value as 'rates' | 'news')}>
            <option value="rates">Rates</option>
            <option value="news">News</option>
          </select>
          <select className="rounded border border-slate-700 bg-slate-950 px-2 py-1" value={format} onChange={(e) => setFormat(e.target.value as 'csv' | 'txt')}>
            <option value="txt">TXT</option>
            <option value="csv">CSV</option>
          </select>
          <input
            type="file"
            accept={format === 'csv' ? '.csv,text/csv' : '.txt,text/plain'}
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const content = await readFileText(file);
              await importMutation.mutateAsync({ fileName: file.name, kind, format, content });
            }}
          />
          <button
            onClick={() => trainMutation.mutate()}
            className="rounded bg-blue-600 px-3 py-1 text-white disabled:opacity-60"
            disabled={trainMutation.isPending}
          >
            Run Training
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Upload files like /home/runner/work/terminal/terminal/news (1).txt and /home/runner/work/terminal/terminal/rates (1).txt, then trigger training.
        </p>
      </Panel>

      <Panel title="WhatsApp channel connectors">
        <div className="grid gap-2 text-xs md:grid-cols-5">
          <button className="rounded border border-slate-700 px-2 py-1" onClick={() => createIntegrationMutation.mutate()}>
            Create Integration
          </button>
          <input
            value={integrationId}
            onChange={(e) => setIntegrationId(e.target.value)}
            placeholder="integration id"
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1"
          />
          <input
            value={channelName}
            onChange={(e) => setChannelName(e.target.value)}
            placeholder="channel name"
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1"
          />
          <input
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder="invite code"
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1"
          />
          <div className="flex gap-2">
            <button className="rounded border border-slate-700 px-2 py-1" onClick={() => createSourceMutation.mutate()}>
              Add Channel
            </button>
            <button className="rounded bg-emerald-600 px-2 py-1 text-white" onClick={() => connectMutation.mutate()}>
              Connect
            </button>
          </div>
        </div>
        <div className="mt-2 space-y-1 text-xs text-slate-300">
          {(integrationsQuery.data?.data.items ?? []).map((integration) => (
            <div key={integration.id} className="rounded border border-slate-800 p-2">
              <p>
                {integration.name} · {integration.status} · {integration.id}
              </p>
              <p className="text-slate-500">Sources: {integration.sources?.length ?? 0}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
};

export const PublicDashboardPage = () => {
  const [currencyCode, setCurrencyCode] = useState('USD');
  const predictionsQuery = useQuery({ queryKey: ['public-predictions'], queryFn: () => dataService.publicDashboard.predictions() });
  const seriesQuery = useQuery({
    queryKey: ['public-series', currencyCode],
    queryFn: () => dataService.publicDashboard.historicalSeries({ currencyCode }),
  });
  const tableQuery = useQuery({
    queryKey: ['public-table', currencyCode],
    queryFn: () => dataService.publicDashboard.historicalTable({ currencyCode, pageSize: 30 }),
  });

  const rows = seriesQuery.data?.data.items ?? [];
  const tableRows = tableQuery.data?.data.items ?? [];
  const predictions = useMemo(
    () => (predictionsQuery.data?.data.items ?? []).filter((x) => x.pair.startsWith(currencyCode)),
    [predictionsQuery.data?.data.items, currencyCode],
  );

  if (predictionsQuery.isLoading || seriesQuery.isLoading || tableQuery.isLoading) {
    return <LoadingState label="Loading public dashboard..." />;
  }

  return (
    <div className="min-h-screen space-y-3 bg-[#04070d] p-4 text-slate-200">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-blue-300">Public FX Forecast Dashboard</h1>
        <input
          value={currencyCode}
          onChange={(e) => setCurrencyCode(e.target.value.toUpperCase())}
          className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs"
          placeholder="USD"
        />
      </div>

      <Panel title="Predictions (24h / 48h)">
        {predictions.length ? (
          <div className="grid gap-2 text-xs md:grid-cols-2">
            {predictions.map((prediction) => (
              <div key={prediction.id} className="rounded border border-slate-800 p-2">
                <p className="font-medium">{prediction.pair} · +{prediction.horizonHours}h</p>
                <p>Point: {fmtNumber(Number(prediction.pointForecast))}</p>
                <p>
                  CI: {fmtNumber(Number(prediction.confidenceLow))} - {fmtNumber(Number(prediction.confidenceHigh))}
                </p>
                <p className="text-slate-400">Confidence: {prediction.confidenceLabel}</p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState label="No published predictions yet" />
        )}
      </Panel>

      <Panel title="Past Prices Graph">{rows.length ? <RateChart rows={rows} mode="line" /> : <EmptyState />}</Panel>

      <Panel title="Past Prices Table">
        {tableRows.length ? (
          <div className="overflow-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-400">
                  <th className="px-2 py-1">Time</th>
                  <th className="px-2 py-1">Buy</th>
                  <th className="px-2 py-1">Sell</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-900">
                    <td className="px-2 py-1">{fmtDateTime(row.recordedAt)}</td>
                    <td className="px-2 py-1">{fmtNumber(Number(row.buyRate))}</td>
                    <td className="px-2 py-1">{fmtNumber(Number(row.sellRate))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState />
        )}
      </Panel>
    </div>
  );
};
