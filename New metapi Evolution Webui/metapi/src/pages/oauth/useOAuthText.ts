import { useLang } from '../../contexts/LangContext';
const messages = {
  active: ['Active', '啟用中', '启用中'],
  attention: ['Needs attention', '需注意', '需注意'],
  pool: ['Pool', '集區', '池'],
  flow: ['Open the authorization page and complete consent, then return here. If automatic callback fails, paste the callback URL.', '開啟授權頁面並完成同意後返回此處。若自動回呼失敗，請貼上回呼 URL。', '打开授权页面并完成同意后返回此处。若自动回调失败，请粘贴回调 URL。'],
  authorize: ['Open authorization page', '開啟授權頁面', '打开授权页面'],
  waiting: ['Waiting for authorization', '等待授權完成', '等待授权完成'],
  success: ['Authorization completed', '授權已完成', '授权已完成'],
  callback: ['Callback URL', '回呼 URL', '回调 URL'],
  submit: ['Submit callback', '提交回呼', '提交回调'],
  code: ['Device user code', '裝置使用者代碼', '设备用户代码'],
  redirect: ['Redirect URI', '重新導向 URI', '重定向 URI'],
  tunnel: ['SSH tunnel', 'SSH 通道', 'SSH 通道'],
  failed: ['Authorization failed', '授權失敗', '授权失败'],
  models: ['Models', '模型', '模型'],
  refresh: ['Refresh models', '刷新模型', '刷新模型'],
  manual: ['Manual', '手動', '手动'],
  disabled: ['Disabled', '已停用', '已停用'],
  noModels: ['No models synchronized', '尚未同步模型', '尚未同步模型'],
  imported: ['Imported', '已匯入', '已导入'],
  skipped: ['Skipped', '已略過', '已跳过'],
  failures: ['Failed', '失敗', '失败'],
  files: ['Select OAuth JSON files', '選擇 OAuth JSON 檔案', '选择 OAuth JSON 文件'],
  native: ['Native OAuth credentials JSON (one object)', '原生 OAuth 憑證 JSON（單一物件）', '原生 OAuth 凭证 JSON（单个对象）'],
  invalid: ['Enter a native OAuth JSON object, not an array.', '請輸入原生 OAuth JSON 物件，而非陣列。', '请输入原生 OAuth JSON 对象，而非数组。'],
  prototype: ['Authorization is unavailable in prototype mode.', '原型模式無法進行授權。', '原型模式无法进行授权。'],
  edit: ['Edit route unit', '編輯路由單元', '编辑路由单元'],
  error: ['Operation failed', '操作失敗', '操作失败'],
} as const;
export function useOAuthText() {
  const { lang } = useLang();
  const index = lang === 'zh-Hant' ? 1 : lang === 'zh-Hans' ? 2 : 0;
  return (key: keyof typeof messages) => messages[key][index];
}
