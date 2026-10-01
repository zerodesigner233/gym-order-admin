import axios from 'axios'
import { BizError } from '../api/request'

/**
 * 页面层 catch 的统一出口。
 *
 * 预期内的失败——业务码非 0（`BizError`）、HTTP 4xx/5xx、超时、断网——
 * 都已经被 axios 响应拦截器弹过提示，页面只需静默兜住以免重复打扰用户；
 * 这类错误也不写控制台，否则会污染端到端用例「0 console error」的断言。
 *
 * 但 catch 会把**所有**异常一并吞掉，包括我们自己代码里的 TypeError
 * （读 undefined 的属性、调错方法名、对 null 直接 .map）。这类错误既不会有人
 * 提示，也几乎没有别的暴露途径，一旦发生就表现为「点了没反应」的灵异 bug。
 * 所以只让预期外的错误落控制台，并带上出错位置便于定位。
 *
 * @param {unknown} error  catch 到的异常
 * @param {string} context 出错位置，形如 `OrderList.handleBatchRenew`
 */
export function logUnexpectedError(error, context) {
  if (isHandledError(error)) return
  console.error(`[${context}] 预期外的错误：`, error)
}

/** 是否已被响应拦截器处理过（即用户已经看到过提示，无需再上报） */
function isHandledError(error) {
  return error instanceof BizError || axios.isAxiosError(error)
}
