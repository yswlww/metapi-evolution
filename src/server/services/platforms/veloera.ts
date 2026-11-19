import { BasePlatformAdapter, CheckinResult, BalanceInfo } from './base.js';

export class VeloeraAdapter extends BasePlatformAdapter {
  readonly platformName = 'veloera';

  async detect(url: string): Promise<boolean> {
    try {
      const res = await this.fetchJson<any>(`${url}/api/status`);
      return res?.success === true && (
        res?.data?.system_name?.toLowerCase().includes('veloera') ||
        res?.data?.version?.includes('veloera')
      );
    } catch {
      return false;
    }
  }

  private veloeraHeaders(accessToken: string, userId?: number): Record<string, string> {
    const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
    if (userId) {
      const value = String(userId);
      headers['Veloera-User'] = value;
      headers['New-API-User'] = value;
      headers['User-id'] = value;
    }
    return headers;
  }

  async checkin(baseUrl: string, accessToken: string, platformUserId?: number): Promise<CheckinResult> {
    const headers = this.veloeraHeaders(accessToken, platformUserId);
    const endpoints = ['/api/user/checkin', '/api/user/check_in'];
    let lastMessage = 'Check-in failed';

    for (const endpoint of endpoints) {
      try {
        const res = await this.fetchJson<any>(`${baseUrl}${endpoint}`, {
          method: 'POST',
          headers,
        });
        if (res?.success) {
          const reward = res.data?.quota ?? res.data?.quota_awarded ?? res.data?.reward;
          return {
            success: true,
            message: res.message || 'Check-in successful',
            ...(reward == null ? {} : { reward: String(reward) }),
          };
        }
        lastMessage = res?.message || lastMessage;
        return { success: false, message: lastMessage };
      } catch (err: any) {
        lastMessage = err?.message || lastMessage;
        if (!String(lastMessage).includes('404')) {
          return { success: false, message: lastMessage };
        }
      }
    }

    return { success: false, message: lastMessage };
  }

  async getBalance(baseUrl: string, accessToken: string, platformUserId?: number): Promise<BalanceInfo> {
    const res = await this.fetchJson<any>(`${baseUrl}/api/user/self`, {
      headers: this.veloeraHeaders(accessToken, platformUserId),
    });
    const data = res?.data;
    const quota = (data?.quota || 0) / 1000000;
    const used = (data?.used_quota || 0) / 1000000;
    const todayIncome = Number.isFinite(data?.today_income) ? (data.today_income / 1000000) : undefined;
    const todayQuotaConsumption = Number.isFinite(data?.today_quota_consumption) ? (data.today_quota_consumption / 1000000) : undefined;
    return { balance: quota - used, used, quota, todayIncome, todayQuotaConsumption };
  }

  async getModels(baseUrl: string, apiToken: string, _platformUserId?: number): Promise<string[]> {
    const res = await this.fetchJson<any>(`${baseUrl}/v1/models`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    return (res?.data || []).map((m: any) => m.id).filter(Boolean);
  }
}
