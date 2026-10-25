/** 人员注册使用公开固定目录；与服务端身份字典保持一致。 */
export const serviceFields = [
    '社会福利',
    '社会救助',
    '慈善事业',
    '社区建设',
    '婚姻家庭',
    '精神卫生',
    '残障康复',
    '教育辅导',
    '就业援助',
    '职工帮扶',
    '犯罪预防',
    '禁毒戒毒',
    '矫治帮教',
    '卫生健康',
    '纠纷调解',
    '应急处置',
    '其他-街道反邪教服务',
    '其他-现退役军人服务',
    '其他-场馆运营',
    '其他-双百服务',
    '其他-心理服务',
    '其他-督导输出',
    '其他',
] as const
/** 督导仅可由具有管理岗位资格的人员担任。 */
export const managementPositions = [
    'position-6',
    'position-8',
    'position-9',
    'position-10',
    'position-11',
]
export const canSupervise = (positionCode: string | null) =>
    managementPositions.includes(positionCode ?? '')
