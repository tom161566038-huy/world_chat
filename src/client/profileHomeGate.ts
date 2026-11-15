/**
 * 用户主页门禁（唯一入口）：「查看主页」必须先经过这里，简略资料卡不设门禁、永远免费。
 * 以后若要改成「付费才能打开主页」，只改 canOpenProfileHome 这一个函数即可；
 * 拒绝时返回 { allowed: false }，界面显示不可打开状态（不在这里做付款流程）。
 */
export interface ProfileHomeAccess {
  allowed: boolean
}

export function canOpenProfileHome(_userId: string): ProfileHomeAccess {
  // 现阶段永远放行：直接打开主页。
  return { allowed: true }
}
