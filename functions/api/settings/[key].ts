import type { ApiResponse } from '../../../src/types/index.ts';
import {
  getPublicBooleanSettingStoredValue,
  isStoredBooleanString,
} from '../../../src/services/publicSettingsSchema.ts';
import type { Env } from '../_shared.ts';
import {
  clearSyncAccessToken,
  deleteSetting,
  getSetting,
  isPasswordConfigured,
  isPublicSettingKey,
  isSyncAccessTokenConfigured,
  jsonResponse,
  optionsResponse,
  parseJsonBody,
  readSession,
  requireAdminSession,
  setSyncAccessToken,
  setPasswordForScope,
  setSetting,
  validateSyncAccessToken,
} from '../_shared.ts';

const SETTINGS_UPDATE_BODY_MAX_BYTES = 64 * 1024;
const MIN_PASSWORD_LENGTH = 6;
const MAX_PASSWORD_LENGTH = 256;

export const onRequestOptions = async (): Promise<Response> => optionsResponse();

export const onRequestGet = async (context: { params: { key: string }; request: Request; env: Env }): Promise<Response> => {
  try {
    const { key } = context.params;

    if (!key) {
      return jsonResponse<ApiResponse>({
        success: false,
        error: '缺少设置键名',
      }, { status: 400 });
    }

    if (isPublicSettingKey(key)) {
      const value = await getSetting(context.env.DB, key);

      return jsonResponse<Record<string, string>>({
        success: true,
        data: { [key]: getPublicBooleanSettingStoredValue({ [key]: value }, key) },
      });
    }

    const session = await readSession(context.request, context.env);
    const unauthorized = requireAdminSession(session);
    if (unauthorized) {
      return unauthorized;
    }

    if (key === 'admin_password_configured') {
      return jsonResponse<Record<string, boolean>>({
        success: true,
        data: { [key]: await isPasswordConfigured(context.env.DB, 'admin', context.env) },
      });
    }

    if (key === 'app_password_configured') {
      return jsonResponse<Record<string, boolean>>({
        success: true,
        data: { [key]: await isPasswordConfigured(context.env.DB, 'app', context.env) },
      });
    }

    if (key === 'sync_access_token_configured') {
      return jsonResponse<Record<string, boolean>>({
        success: true,
        data: { [key]: await isSyncAccessTokenConfigured(context.env.DB, context.env) },
      });
    }

    return jsonResponse<ApiResponse>({
      success: false,
      error: '设置不存在',
    }, { status: 404 });
  } catch (error) {
    return jsonResponse<ApiResponse>({
      success: false,
      error: error instanceof Error ? error.message : '获取设置失败',
    }, { status: 500 });
  }
};

export const onRequestPut = async (context: { params: { key: string }; request: Request; env: Env }): Promise<Response> => {
  try {
    const { key } = context.params;

    if (!key) {
      return jsonResponse<ApiResponse>({
        success: false,
        error: '缺少设置键名',
      }, { status: 400 });
    }

    const session = await readSession(context.request, context.env);
    const unauthorized = requireAdminSession(session);
    if (unauthorized) {
      return unauthorized;
    }

    const { data: body, error: bodyError, status: bodyStatus } = await parseJsonBody<{ value?: string }>(context.request, {
      requireObject: true,
      requireJsonContentType: true,
      maxBodyBytes: SETTINGS_UPDATE_BODY_MAX_BYTES,
    });
    if (!body) {
      return jsonResponse<ApiResponse>({
        success: false,
        error: bodyError ?? '请求体格式无效',
      }, { status: bodyStatus ?? 400 });
    }

    const value = body.value;

    if (typeof value !== 'string') {
      return jsonResponse<ApiResponse>({
        success: false,
        error: '设置值必须是字符串',
      }, { status: 400 });
    }

    if (key === 'admin_password') {
      const trimmedValue = value.trim();
      if (trimmedValue.length < MIN_PASSWORD_LENGTH) {
        return jsonResponse<ApiResponse>({
          success: false,
          error: `管理员密码长度至少 ${MIN_PASSWORD_LENGTH} 位`,
        }, { status: 400 });
      }

      if (trimmedValue.length > MAX_PASSWORD_LENGTH) {
        return jsonResponse<ApiResponse>({
          success: false,
          error: `管理员密码长度不能超过 ${MAX_PASSWORD_LENGTH} 位`,
        }, { status: 400 });
      }

      await setPasswordForScope(context.env.DB, 'admin', trimmedValue);
      return jsonResponse<ApiResponse>({
        success: true,
        message: '管理员密码更新成功',
      });
    }

    if (key === 'app_password') {
      const trimmedValue = value.trim();
      if (trimmedValue.length < MIN_PASSWORD_LENGTH) {
        return jsonResponse<ApiResponse>({
          success: false,
          error: `应用密码长度至少 ${MIN_PASSWORD_LENGTH} 位`,
        }, { status: 400 });
      }

      if (trimmedValue.length > MAX_PASSWORD_LENGTH) {
        return jsonResponse<ApiResponse>({
          success: false,
          error: `应用密码长度不能超过 ${MAX_PASSWORD_LENGTH} 位`,
        }, { status: 400 });
      }

      await setPasswordForScope(context.env.DB, 'app', trimmedValue);
      return jsonResponse<ApiResponse>({
        success: true,
        message: '应用密码更新成功',
      });
    }

    if (key === 'sync_access_token') {
      let trimmedValue: string;
      try {
        trimmedValue = validateSyncAccessToken(value);
      } catch (error) {
        return jsonResponse<ApiResponse>({
          success: false,
          error: error instanceof Error ? error.message : '同步令牌格式无效',
        }, { status: 400 });
      }

      await setSyncAccessToken(context.env.DB, trimmedValue);
      return jsonResponse<ApiResponse>({
        success: true,
        message: '同步令牌更新成功',
      });
    }

    if (!isPublicSettingKey(key)) {
      return jsonResponse<ApiResponse>({
        success: false,
        error: '不允许修改该设置',
      }, { status: 400 });
    }

    if (!isStoredBooleanString(value)) {
      return jsonResponse<ApiResponse>({
        success: false,
        error: '布尔设置仅允许 true 或 false',
      }, { status: 400 });
    }

    if (key === 'app_password_enabled' && value === 'true') {
      const configured = await isPasswordConfigured(context.env.DB, 'app', context.env);

      if (!configured) {
        return jsonResponse<ApiResponse>({
          success: false,
          error: '请先设置应用访问密码，再开启访问保护',
        }, { status: 400 });
      }
    }

    await setSetting(context.env.DB, key, value);
    return jsonResponse<ApiResponse>({
      success: true,
      message: '设置更新成功',
    });
  } catch (error) {
    return jsonResponse<ApiResponse>({
      success: false,
      error: error instanceof Error ? error.message : '更新设置失败',
    }, { status: 500 });
  }
};

export const onRequestDelete = async (context: { params: { key: string }; request: Request; env: Env }): Promise<Response> => {
  try {
    const { key } = context.params;

    if (!key) {
      return jsonResponse<ApiResponse>({
        success: false,
        error: '缺少设置键名',
      }, { status: 400 });
    }

    const session = await readSession(context.request, context.env);
    const unauthorized = requireAdminSession(session);
    if (unauthorized) {
      return unauthorized;
    }

    if (key !== 'app_password' && key !== 'admin_password' && key !== 'sync_access_token') {
      return jsonResponse<ApiResponse>({
        success: false,
        error: '不允许删除该设置',
      }, { status: 400 });
    }

    if (key === 'sync_access_token') {
      await clearSyncAccessToken(context.env.DB);
    } else {
      const targetKeys = key === 'admin_password'
        ? ['admin_password_hash', 'admin_password']
        : ['app_password_hash', 'app_password'];

      await Promise.all(targetKeys.map((targetKey) => deleteSetting(context.env.DB, targetKey)));
    }

    if (key === 'app_password') {
      await setSetting(context.env.DB, 'app_password_enabled', 'false');
    }

    return jsonResponse<ApiResponse>({
      success: true,
      message: '设置删除成功',
    });
  } catch (error) {
    return jsonResponse<ApiResponse>({
      success: false,
      error: error instanceof Error ? error.message : '删除设置失败',
    }, { status: 500 });
  }
};
