/**
 * React 运行时能力桥接层。
 *
 * axios 拦截器、zustand store 都是「React 之外」的模块，
 * 但它们需要用到只有 React 上下文里才有的能力：
 *   - antd 的 App.useApp() 拿到带主题上下文的 message
 *   - react-router 的 navigate
 *
 * 这里用「模块级 ref + 组件注册」的方式把这些引用注入出去，
 * 避免拦截器 / store 反向 import React 组件造成循环依赖，
 * 同时也保证 message 走的是 ConfigProvider 主题上下文（静态 message 不会）。
 */

/* ------------------------------- message ---------------------------------- */

let toastApi = null

/** 由 <GlobalProviders /> 在渲染后调用 */
export function bindToast(api) {
  toastApi = api
}

export const toast = {
  success(content) {
    toastApi?.message.success(content)
  },
  error(content) {
    toastApi?.message.error(content)
  },
  warning(content) {
    toastApi?.message.warning(content)
  },
  info(content) {
    toastApi?.message.info(content)
  },
}

/* ------------------------------ navigation -------------------------------- */

let navigator = null

/** 由 <RouterBridge /> 在渲染后调用 */
export function bindNavigator(fn) {
  navigator = fn
}

/** 页面跳转（未挂载时退化为整页跳转，保证 401 一定能离开受保护页） */
export function navigateTo(path, options = {}) {
  if (typeof navigator === 'function') {
    navigator(path, options)
  } else if (typeof window !== 'undefined') {
    window.location.replace(path)
  }
}

/* --------------------------- unauthorized --------------------------------- */

let unauthorizedHandler = null

/** 由 authStore 注册：清 token + 提示 + 跳登录页 */
export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = fn
}

/** 由 axios 响应拦截器在遇到 401 时调用 */
export function runUnauthorizedHandler() {
  return typeof unauthorizedHandler === 'function' ? unauthorizedHandler() : undefined
}
