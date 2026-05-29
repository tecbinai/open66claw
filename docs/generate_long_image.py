# -*- coding: utf-8 -*-
"""
生成《医药大健康·短视频引流全自动化系统·业务需求方案》长图
"""
from PIL import Image, ImageDraw, ImageFont
import os, sys

# ── 配置 ──────────────────────────────────────────────────
W = 1080          # 图片宽度
PAD_X = 60        # 左右内边距
PAD_TOP = 80
PAD_BOT = 100
CONTENT_W = W - PAD_X * 2

# 颜色
BG = '#FFFFFF'
BLUE_DARK = '#1A56DB'
BLUE_LIGHT = '#3B82F6'
BLUE_BG = '#EFF6FF'
BLUE_HEADER = '#1E40AF'
GRAY_DARK = '#1F2937'
GRAY_MED = '#6B7280'
GRAY_LIGHT = '#F3F4F6'
GRAY_LINE = '#D1D5DB'
WHITE = '#FFFFFF'
RED = '#DC2626'
GREEN_BG = '#F0FDF4'
RED_BG = '#FEF2F2'
ORANGE_BG = '#FFFBEB'

# 字体 - Windows
def get_font(size, bold=False):
    names = ['msyhbd.ttc', 'msyh.ttc', 'simhei.ttf', 'simsun.ttc'] if bold else ['msyh.ttc', 'msyhbd.ttc', 'simhei.ttf', 'simsun.ttc']
    for name in names:
        for base in [r'C:\Windows\Fonts', r'C:\Users\72793\AppData\Local\Microsoft\Windows\Fonts']:
            path = os.path.join(base, name)
            if os.path.exists(path):
                try:
                    return ImageFont.truetype(path, size)
                except:
                    continue
    return ImageFont.load_default()

FONT_TITLE = get_font(48, True)
FONT_SUBTITLE = get_font(28, True)
FONT_H1 = get_font(26, True)
FONT_H2 = get_font(20, True)
FONT_H3 = get_font(17, True)
FONT_BODY = get_font(16)
FONT_BODY_BOLD = get_font(16, True)
FONT_SMALL = get_font(14)
FONT_SMALL_BOLD = get_font(14, True)
FONT_TINY = get_font(12)
FONT_FLOW = get_font(15, True)
FONT_COVER_INFO = get_font(18)

# ── 绘制引擎 ─────────────────────────────────────────────
class LongImageRenderer:
    def __init__(self):
        self.y = PAD_TOP
        self.elements = []  # (type, data)

    def _text_height(self, text, font, max_w):
        """计算自动换行后的文本高度"""
        lines = self._wrap_text(text, font, max_w)
        if not lines:
            return 0
        line_h = font.size + 6
        return len(lines) * line_h

    def _wrap_text(self, text, font, max_w):
        """自动换行"""
        if not text:
            return []
        lines = []
        for raw_line in text.split('\n'):
            if not raw_line:
                lines.append('')
                continue
            current = ''
            for ch in raw_line:
                test = current + ch
                bbox = FONT_BODY.getbbox(test)
                tw = bbox[2] - bbox[0] if bbox else len(test) * font.size
                # rough estimate with actual font
                try:
                    tw = font.getlength(test)
                except:
                    tw = len(test) * font.size * 0.6
                if tw > max_w and current:
                    lines.append(current)
                    current = ch
                else:
                    current = test
            if current:
                lines.append(current)
        return lines

    def _draw_wrapped(self, draw, x, y, text, font, color, max_w):
        """绘制自动换行文本，返回最终y"""
        lines = self._wrap_text(text, font, max_w)
        line_h = font.size + 8
        for line in lines:
            draw.text((x, y), line, fill=color, font=font)
            y += line_h
        return y

    def add_space(self, h):
        self.elements.append(('space', h))
        self.y += h

    def add_cover(self):
        self.elements.append(('cover', None))
        self.y += 680

    def add_divider(self):
        self.elements.append(('divider', None))
        self.y += 30

    def add_h1(self, text):
        self.elements.append(('h1', text))
        self.y += 70

    def add_h2(self, text):
        self.elements.append(('h2', text))
        self.y += 50

    def add_h3(self, text):
        self.elements.append(('h3', text))
        self.y += 40

    def add_body(self, text):
        h = self._text_height(text, FONT_BODY, CONTENT_W - 20)
        self.elements.append(('body', text))
        self.y += max(h + 16, 36)

    def add_bullet(self, text):
        h = self._text_height(text, FONT_BODY, CONTENT_W - 40)
        self.elements.append(('bullet', text))
        self.y += max(h + 12, 32)

    def add_warning(self, text):
        h = self._text_height(text, FONT_BODY_BOLD, CONTENT_W - 50)
        self.elements.append(('warning', text))
        self.y += max(h + 28, 50)

    def add_flow(self, text):
        h = self._text_height(text, FONT_FLOW, CONTENT_W - 40)
        self.elements.append(('flow', text))
        self.y += max(h + 28, 50)

    def add_table(self, headers, rows, col_ratios=None):
        if not col_ratios:
            col_ratios = [1.0 / len(headers)] * len(headers)
        row_heights = []
        for row in [headers] + rows:
            max_h = 32
            for i, cell in enumerate(row):
                cw = int(CONTENT_W * col_ratios[i]) - 16
                h = self._text_height(str(cell), FONT_SMALL, cw)
                max_h = max(max_h, h + 16)
            row_heights.append(max_h)
        total_h = sum(row_heights) + 10
        self.elements.append(('table', (headers, rows, col_ratios, row_heights)))
        self.y += total_h

    def add_note(self, text):
        h = self._text_height(text, FONT_SMALL, CONTENT_W - 40)
        self.elements.append(('note', text))
        self.y += max(h + 16, 30)

    def render(self):
        total_h = self.y + PAD_BOT
        img = Image.new('RGB', (W, total_h), BG)
        draw = ImageDraw.Draw(img)
        y = PAD_TOP

        for etype, data in self.elements:
            if etype == 'space':
                y += data

            elif etype == 'cover':
                # 蓝色背景区
                draw.rectangle([0, y - 40, W, y + 640], fill=BLUE_DARK)
                # 装饰线
                draw.rectangle([PAD_X, y + 180, W - PAD_X, y + 183], fill='#3B82F6')
                # 标题
                t1 = '医药大健康'
                try:
                    tw = FONT_TITLE.getlength(t1)
                except:
                    tw = len(t1) * 48
                draw.text(((W - tw) / 2, y + 60), t1, fill=WHITE, font=FONT_TITLE)

                t2 = '短视频引流全自动化系统'
                try:
                    tw = FONT_SUBTITLE.getlength(t2)
                except:
                    tw = len(t2) * 28
                draw.text(((W - tw) / 2, y + 130), t2, fill='#93C5FD', font=FONT_SUBTITLE)

                t3 = '业 务 需 求 方 案'
                try:
                    tw = FONT_H2.getlength(t3)
                except:
                    tw = len(t3) * 20
                draw.text(((W - tw) / 2, y + 210), t3, fill='#BFDBFE', font=FONT_H2)

                # 信息
                infos = [
                    '客户行业：医药 / 大健康',
                    '引流平台：抖音 · 快手 · 小红书',
                    '业务模式：短视频/图文引流 → 私域沉淀 → 成交转化',
                    '文档版本：v1.0 | 2026 年 3 月',
                ]
                iy = y + 300
                for info in infos:
                    try:
                        tw = FONT_COVER_INFO.getlength(info)
                    except:
                        tw = len(info) * 18
                    draw.text(((W - tw) / 2, iy), info, fill='#DBEAFE', font=FONT_COVER_INFO)
                    iy += 36

                # 底部装饰
                draw.rectangle([PAD_X, y + 580, W - PAD_X, y + 583], fill='#3B82F6')
                y += 680

            elif etype == 'divider':
                draw.rectangle([PAD_X, y + 12, W - PAD_X, y + 14], fill=GRAY_LINE)
                y += 30

            elif etype == 'h1':
                # 蓝色背景条
                draw.rectangle([PAD_X - 10, y, W - PAD_X + 10, y + 48], fill=BLUE_DARK)
                draw.rectangle([PAD_X - 10, y, PAD_X + 4, y + 48], fill='#2563EB')
                draw.text((PAD_X + 16, y + 10), data, fill=WHITE, font=FONT_H1)
                y += 70

            elif etype == 'h2':
                draw.rectangle([PAD_X, y + 4, PAD_X + 4, y + 30], fill=BLUE_LIGHT)
                draw.text((PAD_X + 14, y + 4), data, fill=GRAY_DARK, font=FONT_H2)
                y += 50

            elif etype == 'h3':
                draw.ellipse([PAD_X + 4, y + 7, PAD_X + 14, y + 17], fill=BLUE_LIGHT)
                draw.text((PAD_X + 22, y + 2), data, fill=GRAY_DARK, font=FONT_H3)
                y += 40

            elif etype == 'body':
                y = self._draw_wrapped(draw, PAD_X + 10, y, data, FONT_BODY, GRAY_DARK, CONTENT_W - 20)
                y += 8

            elif etype == 'bullet':
                draw.ellipse([PAD_X + 10, y + 7, PAD_X + 17, y + 14], fill=BLUE_LIGHT)
                y = self._draw_wrapped(draw, PAD_X + 26, y, data, FONT_BODY, GRAY_DARK, CONTENT_W - 40)
                y += 6

            elif etype == 'warning':
                h = self._text_height(data, FONT_BODY_BOLD, CONTENT_W - 50)
                box_h = max(h + 20, 40)
                draw.rectangle([PAD_X, y, W - PAD_X, y + box_h], fill=RED_BG)
                draw.rectangle([PAD_X, y, PAD_X + 4, y + box_h], fill=RED)
                self._draw_wrapped(draw, PAD_X + 20, y + 10, data, FONT_BODY_BOLD, RED, CONTENT_W - 50)
                y += box_h + 10

            elif etype == 'flow':
                h = self._text_height(data, FONT_FLOW, CONTENT_W - 40)
                box_h = max(h + 20, 42)
                draw.rectangle([PAD_X, y, W - PAD_X, y + box_h], fill=BLUE_BG, outline='#BFDBFE')
                # center text
                lines = self._wrap_text(data, FONT_FLOW, CONTENT_W - 40)
                line_h = FONT_FLOW.size + 8
                ty = y + (box_h - len(lines) * line_h) // 2
                for line in lines:
                    try:
                        tw = FONT_FLOW.getlength(line)
                    except:
                        tw = len(line) * 15
                    draw.text(((W - tw) / 2, ty), line, fill=BLUE_DARK, font=FONT_FLOW)
                    ty += line_h
                y += box_h + 8

            elif etype == 'table':
                headers, rows, col_ratios, row_heights = data
                tx = PAD_X
                # header
                rh = row_heights[0]
                cx = tx
                for i, h in enumerate(headers):
                    cw = int(CONTENT_W * col_ratios[i])
                    draw.rectangle([cx, y, cx + cw, y + rh], fill=BLUE_HEADER)
                    draw.rectangle([cx, y, cx + cw, y + rh], outline='#1E3A8A')
                    self._draw_wrapped(draw, cx + 8, y + 6, str(h), FONT_SMALL_BOLD, WHITE, cw - 16)
                    cx += cw
                y += rh

                # rows
                for r_idx, row in enumerate(rows):
                    rh = row_heights[r_idx + 1]
                    bg = GRAY_LIGHT if r_idx % 2 == 0 else WHITE
                    cx = tx
                    for i, cell in enumerate(row):
                        cw = int(CONTENT_W * col_ratios[i])
                        draw.rectangle([cx, y, cx + cw, y + rh], fill=bg)
                        draw.rectangle([cx, y, cx + cw, y + rh], outline=GRAY_LINE)
                        self._draw_wrapped(draw, cx + 8, y + 6, str(cell), FONT_SMALL, GRAY_DARK, cw - 16)
                        cx += cw
                    y += rh
                y += 10

            elif etype == 'note':
                draw.text((PAD_X + 10, y), '* ' + data, fill=GRAY_MED, font=FONT_SMALL)
                y += 30

        return img


# ═══════════════════════════════════════════════════════════
# 构建内容
# ═══════════════════════════════════════════════════════════
r = LongImageRenderer()

# 封面
r.add_cover()
r.add_space(20)

# ── 一、业务全景 ──
r.add_h1('一、业务全景')
r.add_h2('1.1 核心业务链路')
r.add_flow('找爆款  →  建知识库  →  做内容  →  矩阵分发  →  截留引流  →  私域成交')

r.add_h2('1.2 系统模块总览')
r.add_table(
    ['模块', '名称', '核心职责'],
    [
        ['M1', '爆款素材采集', '找到行业内正在爆的视频/图文'],
        ['M2', '素人账号采集', '找到真实素人账号，下载内容'],
        ['M3', '内容自动化生产', '基于知识库+模板库批量生产内容'],
        ['M4', '评论区截留引流', '在热门视频评论区抢占前排'],
        ['M5', '点赞引流', '批量点赞目标用户，触发回访'],
        ['M6', '关注引流', '三步关注法，利用回关机制'],
        ['M7', '私信引流转化', '一对一沟通，引导加微信'],
        ['M8', '账号矩阵管理', '多账号养号+风控+状态监控'],
        ['M9', '私域承接成交', '微信沉淀+持续运营+成交'],
    ],
    [0.1, 0.2, 0.7]
)
r.add_divider()

# ── 二、M1 爆款素材采集 ──
r.add_h1('二、M1 爆款素材采集')
r.add_h2('2.1 业务目的')
r.add_body('解决"发什么能火"的问题。快速找到行业内正在爆的视频和图文，提取选题方向、内容结构、热门标签，作为内容生产的输入源。')

r.add_h2('2.2 业务流程')
r.add_flow('维护关键词库 → 三平台并发搜索 → 按爆款条件筛选 → 列表预览 → 批量下载 → 入库打标 → 爆款拆解')

r.add_h2('2.3 功能需求')
r.add_table(
    ['编号', '功能', '说明'],
    [
        ['1.1', '关键词库管理', '维护行业关键词，支持增删改查'],
        ['1.2', '三平台统一搜索', '同时搜索抖音/快手/小红书，结果统一展示'],
        ['1.3', '爆款条件筛选', '按点赞/评论/收藏/时间/博主粉丝等条件过滤'],
        ['1.4', '结果列表预览', '缩略图+标题+数据，支持批量勾选'],
        ['1.5', '一键批量下载', '去水印下载视频/图文/文案/封面/BGM'],
        ['1.6', '素材库管理', '按平台/话题/类型/热度自动分类打标签'],
        ['1.7', '爆款拆解', '记录开头钩子/结构/话术/标签，形成选题卡'],
    ],
    [0.1, 0.2, 0.7]
)

r.add_h2('2.4 爆款筛选条件')
r.add_table(
    ['条件', '抖音', '快手', '小红书'],
    [
        ['点赞量', '>=3,000', '>=2,000', '>=1,000'],
        ['评论量', '>=500', '>=300', '>=200'],
        ['收藏量', '-', '-', '>=500'],
        ['发布时间', '最近72小时', '最近72小时', '最近7天'],
        ['点赞率', '>=3%', '>=5%', '-'],
    ],
    [0.2, 0.27, 0.27, 0.26]
)
r.add_note('所有阈值均支持用户自定义调整。')
r.add_divider()

# ── 三、M2 素人账号采集 ──
r.add_h1('三、M2 素人账号采集')
r.add_h2('3.1 业务目的')
r.add_body('找到真实普通人账号，下载其主页信息和历史作品。用于二创素材来源和养号风格参考。')

r.add_h2('3.2 业务流程')
r.add_flow('设定筛选条件 → 平台搜索 → 系统自动判定是否素人 → 一键下载 → 归档入库')

r.add_h2('3.3 素人判定规则')
r.add_table(
    ['维度', '符合条件', '排除条件'],
    [
        ['粉丝量', '100 ~ 5,000', '< 100 或 > 5,000'],
        ['认证', '无蓝V/黄V', '有任何认证'],
        ['商业痕迹', '无橱窗/商品/星图', '有商业化功能'],
        ['内容风格', '生活化、非专业', '明显包装感'],
        ['发布频率', '不规律', '固定日更'],
        ['账号年龄', '>= 3个月', '新注册号'],
    ],
    [0.2, 0.4, 0.4]
)

r.add_h2('3.4 采集内容')
r.add_table(
    ['采集项', '说明'],
    [
        ['主页信息', '头像/昵称/简介/粉丝数/获赞数/IP属地'],
        ['全部作品', '视频+封面+文案+标签+数据（赞/评/藏/转）'],
        ['评论样本', '该账号在其他视频下的评论（用于学习风格）'],
    ],
    [0.2, 0.8]
)
r.add_divider()

# ── 四、M3 内容自动化生产 ──
r.add_h1('四、M3 内容自动化生产')
r.add_h2('4.1 业务目的')
r.add_body('解决"怎么批量做出能火的内容"。基于爆款素材、专业知识库、素人素材，系统化生产视频和图文，并生成多个差异化版本供矩阵使用。')

r.add_h2('4.2 三大输入源')
r.add_table(
    ['输入源', '提供内容', '核心价值'],
    [
        ['爆款素材库', '热门选题/结构模板/BGM/标签', '什么形式能火'],
        ['专业知识库', '医药知识/养生食疗/合规话术', '说什么内容可信'],
        ['素人素材库', '素人作品/真实表达/生活场景', '怎么说像真人'],
    ],
    [0.2, 0.4, 0.4]
)

r.add_h2('4.3 专业知识库（核心壁垒）')
r.add_table(
    ['分类', '内容', '示例'],
    [
        ['养生科普', '日常调理、食疗方、节气养生', '春季养肝三个习惯'],
        ['成分百科', '草本植物、食材功效', '黄芪的5个日常用法'],
        ['生活方式', '作息/运动/饮食/情绪', '失眠人群的睡前30分钟'],
        ['常见误区', '伪科学辟谣', '这3个养胃方法是错的'],
        ['时令热点', '换季/流感/节气内容', '倒春寒要特别注意'],
        ['合规话术', '安全用词/禁用词', '"调理"替代"治疗"'],
    ],
    [0.15, 0.45, 0.4]
)

r.add_h2('4.4 视频爆款模板')
r.add_table(
    ['模板类型', '结构', '示例标题'],
    [
        ['恐惧开头型', '抛问题→放大痛点→给方案→引导关注', '还在这样喝水？你的肾在求救'],
        ['反常识型', '颠覆认知→解释→正确做法', '红枣补血？大错特错'],
        ['清单型', '数字标题→逐条讲→引导收藏', '中医推荐的5个泡脚方'],
        ['故事型', '经历→问题→解决→现状', '我妈失眠10年，后来...'],
        ['对比型', '错误 vs 正确做法', '90%的人枸杞都吃错了'],
        ['热点借势型', '热点→关联健康→专业解读', 'XX事件背后的健康真相'],
    ],
    [0.17, 0.4, 0.43]
)

r.add_h2('4.5 内容生产流程')
r.add_table(
    ['步骤', '名称', '输入', '输出'],
    [
        ['S1', '选题生成', '爆款库+知识库+热点', '选题卡'],
        ['S2', '脚本生成', '选题卡+模板+知识库', '脚本初稿'],
        ['S3', '合规审核', '脚本+敏感词库', '审核通过的脚本'],
        ['S4', '素材匹配', '脚本内容', '视频片段/图片/BGM'],
        ['S5', '成片生成', '脚本+素材+配音', '视频/图文成品'],
        ['S6', '差异化处理', '原始成片', '多个差异化版本'],
        ['S7', '入库排期', '多版本成片', '按账号/平台分配'],
        ['S8', '数据回收', '发布后48h数据', '反馈优化'],
    ],
    [0.08, 0.14, 0.38, 0.4]
)

r.add_h2('4.6 合规敏感词替换表')
r.add_table(
    ['禁用词', '安全替换'],
    [
        ['治疗/治愈', '调理/改善'],
        ['药/保健品', '好物/好方法'],
        ['疗效显著', '感觉不错/舒服多了'],
        ['患者/病人', '朋友/家人'],
        ['根治/痊愈', '好转/有变化'],
        ['降压/降糖', '注意饮食习惯'],
        ['处方/医嘱', '建议/经验分享'],
    ],
    [0.35, 0.65]
)

r.add_h2('4.7 差异化处理维度')
r.add_body('同一选题生成多个版本，避免平台判定搬运：')
r.add_table(
    ['维度', '做法'],
    [
        ['封面', '换文案/配色/排版'],
        ['开头', '换不同钩子句'],
        ['BGM', '换不同背景音乐'],
        ['配音', '换音色/语速'],
        ['画面', '镜像翻转/调色/换素材'],
        ['文案', '同义改写'],
        ['标签', '换不同标签组合'],
    ],
    [0.2, 0.8]
)

r.add_h2('4.8 内容分发排期')
r.add_table(
    ['维度', '规则'],
    [
        ['发布时段', '早7~9 / 午12~14 / 晚19~22（流量高峰）'],
        ['发布频率', '内容号每天1~2条；引流号每周2~3条'],
        ['平台适配', '同一选题发不同平台调整时长/格式/标签'],
        ['矩阵错开', '同一内容不同版本错开至少2小时'],
        ['热点响应', '突发热点2小时内出内容'],
    ],
    [0.2, 0.8]
)
r.add_divider()

# ── 五、M4 评论区截留引流 ──
r.add_h1('五、M4 评论区截留引流（核心模块）')
r.add_h2('5.1 业务目的')
r.add_body('在他人热门视频评论区抢占靠前位置，通过有价值的评论吸引用户点头像→回访主页→进入私域。这是整个引流体系的核心动作。')

r.add_h2('5.2 业务流程')
r.add_flow('【准备】目标视频筛选 + 话术库维护 + 账号池管理')
r.add_flow('【执行】生成任务(视频+话术+账号匹配) → 观看视频 → 发布评论 → 小号互顶')
r.add_flow('【监控】评论状态监控 → 引流效果追踪 → 数据反馈优化')

r.add_h2('5.3 目标视频筛选')
r.add_table(
    ['维度', '标准'],
    [
        ['行业相关性', '视频内容与医药/健康/养生直接相关'],
        ['评论区活跃度', '评论量 >= 200，且有真实讨论'],
        ['博主粉丝量', '10万~100万（中腰部最佳）'],
        ['发布时间', '优先30分钟内新视频（黄金窗口）'],
        ['数据趋势', '数据正在上升中的视频'],
    ],
    [0.25, 0.75]
)

r.add_h2('5.4 截留时机')
r.add_table(
    ['时机', '发布后', '效果', '说明'],
    [
        ['黄金窗口', '0~30分钟', '*****', '评论少，容易推到前排'],
        ['优质窗口', '30分钟~2小时', '****', '配合小号互顶可上热评'],
        ['常规窗口', '2~6小时', '***', '需靠高质量神评论突围'],
        ['长尾窗口', '6小时以上', '**', '仅针对持续爆火视频'],
    ],
    [0.17, 0.2, 0.13, 0.5]
)

r.add_h2('5.5 话术分层体系')
r.add_table(
    ['层级', '名称', '占比', '示例'],
    [
        ['L1', '纯互动', '60%', '"太对了，深有同感"'],
        ['L2', '价值补充', '20%', '"补充一下，XX情况还可以..."'],
        ['L3', '软引导', '15%', '"之前也有这困扰，后来找到了方法"'],
        ['L4', '钩子型', '5%', '"整理了份XX指南，需要的扣1"'],
    ],
    [0.1, 0.14, 0.1, 0.66]
)

r.add_h2('5.6 执行节奏')
r.add_table(
    ['参数', '抖音', '快手', '小红书'],
    [
        ['单号日上限', '15~20条', '20~30条', '10~15条'],
        ['评论间隔', '1~3分钟', '1~3分钟', '2~4分钟'],
        ['活跃时段', '8:00~23:00', '8:00~23:00', '8:00~23:00'],
        ['休息机制', '每3~5条休息5~15分钟', '同左', '同左'],
    ],
    [0.2, 0.27, 0.27, 0.26]
)
r.add_divider()

# ── 六、M5 点赞引流 ──
r.add_h1('六、M5 点赞引流')
r.add_h2('6.1 业务流程')
r.add_flow('筛选目标用户 → 对每人连续点赞3~5条作品 → 用户回访主页 → 引导关注/私信')
r.add_table(
    ['项目', '参数'],
    [
        ['单号日操作量', '200~500次'],
        ['预期回访率', '1~3%'],
        ['风险等级', '低（点赞是平台鼓励的行为）'],
        ['核心前提', '主页必须优化好：简介有钩子、置顶有价值内容'],
    ],
    [0.25, 0.75]
)
r.add_divider()

# ── 七、M6 关注引流 ──
r.add_h1('七、M6 关注引流')
r.add_h2('7.1 业务流程')
r.add_flow('筛选目标 → 三步关注法（点赞→评论→关注）→ 等待回关 → 回关者进入私信转化')
r.add_table(
    ['项目', '参数'],
    [
        ['单号日操作量', '50~100次'],
        ['预期回关率', '三步法：10~15%（直接关注仅3~5%）'],
        ['风险等级', '中（有日关注上限，超过会限流）'],
        ['适用场景', '冷启动阶段快速建立粉丝基础'],
    ],
    [0.25, 0.75]
)
r.add_divider()

# ── 八、M7 私信引流 ──
r.add_h1('八、M7 私信引流转化')
r.add_h2('8.1 触发场景')
r.add_table(
    ['优先级', '场景', '说明'],
    [
        ['最高', '用户主动私信', '已有明确意向，立即响应'],
        ['高', '用户回复了你的评论', '有互动基础，趁热跟进'],
        ['中', '用户回关了你', '有一定兴趣，发欢迎语'],
        ['低', '用户点赞了你的内容', '轻度兴趣，可尝试'],
    ],
    [0.12, 0.3, 0.58]
)

r.add_h2('8.2 四步转化话术')
r.add_table(
    ['步骤', '目的', '话术示例'],
    [
        ['第1步', '打招呼+确认需求', '"看到你在XX视频下的评论，想了解XX吗？"'],
        ['第2步', '提供价值+建信任', '"我之前也研究过，有些经验可以分享..."'],
        ['第3步', '引导转移+理由', '"平台私信常吞消息，加微信沟通更顺畅"'],
        ['第4步', '发送联系方式', '图片/谐音/引导看主页（避免直发微信号）'],
    ],
    [0.1, 0.22, 0.68]
)

r.add_h2('8.3 运营参数')
r.add_table(
    ['项目', '新号', '老号'],
    [
        ['单号日私信量', '5~10条', '20~30条'],
        ['最佳转化窗口', '互动后24小时内', '-'],
        ['预期回复率', '10~20%', '15~25%'],
        ['回复→加微信', '20~40%', '20~40%'],
        ['风险等级', '高', '中高'],
    ],
    [0.3, 0.35, 0.35]
)
r.add_divider()

# ── 九、M8 账号矩阵 ──
r.add_h1('九、M8 账号矩阵管理')
r.add_h2('9.1 矩阵架构')
r.add_table(
    ['角色', '数量', '职责'],
    [
        ['品牌主号', '1个', '承接流量，展示品牌形象'],
        ['评论截留号', '5~10个', '在热门视频下评论引流'],
        ['内容号', '3~5个', '发布知识科普/案例故事'],
        ['互动号', '5~10个', '给评论点赞上热评+制造热度'],
        ['点赞关注号', '5~10个', '批量点赞/关注拉新'],
    ],
    [0.17, 0.13, 0.7]
)

r.add_h2('9.2 养号生命周期')
r.add_table(
    ['阶段', '天数', '操作', '禁止事项'],
    [
        ['注册完善', 'D1~3', '完善资料/实名/绑手机', '不发内容不评论'],
        ['冷启动', 'D4~7', '日刷30~60分钟/点赞/评论', '不带营销信息'],
        ['活跃期', 'D8~14', '发1~2条生活化原创', '不放联系方式'],
        ['测试期', 'D15~21', '发3~5条垂直内容', '异常需排查'],
        ['正式运营', 'D22+', '按分工执行引流任务', '遵守操作上限'],
    ],
    [0.14, 0.1, 0.4, 0.36]
)

r.add_h2('9.3 封号红线')
r.add_table(
    ['高危行为', '后果'],
    [
        ['同一设备登多个号', '关联封号'],
        ['评论/私信出现微信号/电话/链接', '删评/禁言/封号'],
        ['短时间大量重复操作', '限流/降权'],
        ['新号直接发广告', '永久封号'],
        ['搬运内容不改动', '限流/下架'],
        ['使用模拟器/多开', '设备级封禁'],
    ],
    [0.55, 0.45]
)
r.add_divider()

# ── 十、M9 私域承接 ──
r.add_h1('十、M9 私域承接与成交')
r.add_h2('10.1 承接方式')
r.add_table(
    ['形式', '适用场景'],
    [
        ['个人微信号', '高客单价，需要一对一深度信任'],
        ['企业微信', '规模化运营，合规需求高'],
        ['微信社群', '批量运营，氛围带动成交'],
        ['公众号/小程序', '内容沉淀+标准化成交'],
    ],
    [0.25, 0.75]
)

r.add_h2('10.2 私域运营节奏')
r.add_table(
    ['时间', '动作', '目的'],
    [
        ['Day 0', '欢迎语+自我介绍+赠送行业资料', '建立好感'],
        ['Day 1~3', '朋友圈展示专业内容', '展示专业度'],
        ['Day 3~7', '私聊跟进，了解需求', '建立信任'],
        ['Day 7~14', '推荐产品/服务，给方案', '促成转化'],
        ['Day 14+', '持续运营，定期回访', '长期经营'],
    ],
    [0.15, 0.45, 0.4]
)
r.add_warning('核心原则：公域（抖音/快手/小红书）只做知识输出和信任建立，所有产品推荐和成交只在私域完成。')
r.add_divider()

# ── 十一、全链路转化漏斗 ──
r.add_h1('十一、全链路转化漏斗')
r.add_h2('11.1 单次转化预估')
r.add_table(
    ['环节', '数据', '转化率'],
    [
        ['评论/点赞/关注曝光', '10,000次', '-'],
        ['主页访问', '100~300次', '1~3%'],
        ['产生互动(关注/私信)', '15~45次', '5~15%'],
        ['添加微信', '3~18人', '20~40%'],
        ['深度咨询', '1~9人', '30~50%'],
        ['成交', '0.3~2.7单', '10~30%'],
    ],
    [0.4, 0.3, 0.3]
)

r.add_h2('11.2 矩阵月产能预估')
r.add_table(
    ['指标', '数值'],
    [
        ['单号日产能', '评论15条+点赞300次+关注50次'],
        ['20号矩阵日触达', '约7,000~10,000次'],
        ['月预估进粉', '90~540人'],
        ['月预估成交', '9~80单（取决于客单价和转化能力）'],
    ],
    [0.3, 0.7]
)
r.add_note('以上为保守估算，实际取决于内容质量、话术水平、账号权重等因素。')
r.add_divider()

# ── 十二、合规红线 ──
r.add_h1('十二、医药行业合规红线')
r.add_h2('12.1 内容合规')
r.add_table(
    ['可以做', '绝对不能做'],
    [
        ['健康科普/养生常识/生活建议', '疾病治疗承诺/功效保证'],
        ['个人调理经历分享', '处方药任何形式推广'],
        ['食疗/运动/作息建议', '代替就医的暗示'],
        ['原创科普内容', '伪造案例/虚假证书'],
        ['"调理/改善/缓解/建议"', '"治愈/根治/100%有效/国家级"'],
    ],
    [0.5, 0.5]
)

r.add_h2('12.2 法律底线')
r.add_table(
    ['法规', '核心要求'],
    [
        ['《广告法》第16~18条', '医疗/药品广告不得含功效断言、代言推荐'],
        ['《药品管理法》', '处方药严禁公众广告；需省级药监审批'],
        ['《互联网广告管理办法》', '互联网广告须标注"广告"'],
        ['《个人信息保护法》', '不得违规采集用户个人信息'],
    ],
    [0.35, 0.65]
)
r.add_warning('违法后果：罚款 20~100 万元，严重可追究刑事责任。')

r.add_h2('12.3 合规策略')
r.add_bullet('身份定位：做"健康生活方式分享者"，不做"卖药的"')
r.add_bullet('内容策略：80%纯知识科普 + 20%软性方向引导')
r.add_bullet('转化分离：公域只做信任建立，私域才做推荐和成交')
r.add_bullet('素材二创：只借鉴选题和结构，不搬运不抄袭')
r.add_bullet('合规前置：所有内容发布前过敏感词审核')
r.add_divider()

# ── 十三、模块总览 ──
r.add_h1('十三、系统功能模块总览')
r.add_table(
    ['模块', '核心功能', '使用角色'],
    [
        ['M1 爆款采集', '关键词搜索+条件筛选+批量下载+素材库', '内容运营'],
        ['M2 素人采集', '素人识别+主页下载+风格分析', '内容运营'],
        ['M3 内容生产', '知识库+模板库+选题→脚本→成片→差异化', '内容制作'],
        ['M4 评论截留', '目标筛选+话术匹配+自动评论+效果监控', '引流运营'],
        ['M5 点赞引流', '目标筛选+批量点赞+数据追踪', '引流运营'],
        ['M6 关注引流', '三步关注+回关监控+取关清理', '引流运营'],
        ['M7 私信转化', '触发规则+话术模板+节奏控制', '转化运营'],
        ['M8 账号矩阵', '养号排期+状态监控+风控预警', '账号管理'],
        ['M9 私域承接', '微信沉淀+社群运营+成交管理', '销售/客服'],
        ['数据看板', '全链路数据+内容效果排行+ROI', '管理层'],
    ],
    [0.17, 0.53, 0.3]
)

# 尾部
r.add_space(40)
r.add_flow('本文档为业务需求梳理，不涉及具体技术实现方案。')
r.add_flow('各模块的技术选型、开发排期、成本预算将在需求确认后另行输出。')

# ── 渲染并保存 ──
print('Rendering image...')
img = r.render()
output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'business-plan-long.png')
img.save(output_path, 'PNG', optimize=True)
print(f'Image saved: {output_path}')
print(f'Size: {img.size[0]}x{img.size[1]}')
