/**
 * Chat Page
 * Native React implementation communicating with OpenClaw Gateway
 * via gateway:rpc IPC. Session selector, thinking toggle, and refresh
 * are in the toolbar; messages render with markdown + streaming.
 */
import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Loader2, Sparkles, Search, FileText, Phone, Zap, Flame, ArrowDown } from 'lucide-react';
import { useChatStore, type RawMessage } from '@/stores/chat';
import { useGatewayStore } from '@/stores/gateway';
import { useAgentsStore } from '@/stores/agents';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { ChatToolbar } from './ChatToolbar';
import { extractImages, extractText, extractThinking, extractToolUse } from './message-utils';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useStickToBottomInstant } from '@/hooks/use-stick-to-bottom-instant';
import { useMinLoading } from '@/hooks/use-min-loading';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import welcomeImg from '@/assets/aimiclaw-welcome.png';
import serviceTeamBg from '@/assets/service-team-bg.png';
import marketingTeamBg from '@/assets/marketing-team-bg.png';
import sentinelTeamBg from '@/assets/sentinel-team-bg.png';

export function Chat() {
  const { t } = useTranslation('chat');
  const navigate = useNavigate();
  const gatewayStatus = useGatewayStore((s) => s.status);
  const isGatewayRunning = gatewayStatus.state === 'running';

  const messages = useChatStore((s) => s.messages);
  const currentSessionKey = useChatStore((s) => s.currentSessionKey);
  const loading = useChatStore((s) => s.loading);
  const sending = useChatStore((s) => s.sending);
  const error = useChatStore((s) => s.error);
  const showThinking = useChatStore((s) => s.showThinking);
  const streamingMessage = useChatStore((s) => s.streamingMessage);
  const streamingTools = useChatStore((s) => s.streamingTools);
  const pendingFinal = useChatStore((s) => s.pendingFinal);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const abortRun = useChatStore((s) => s.abortRun);
  const clearError = useChatStore((s) => s.clearError);
  const fetchAgents = useAgentsStore((s) => s.fetchAgents);

  const cleanupEmptySession = useChatStore((s) => s.cleanupEmptySession);

  const [streamingTimestamp, setStreamingTimestamp] = useState<number>(0);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [showSkillPanel, setShowSkillPanel] = useState(true); // 控制技能面板显示
  const [activeTab, setActiveTab] = useState<'all' | 'team'>('all'); // 技能标签页
  const [selectedTeam, setSelectedTeam] = useState<'marketing' | 'service' | 'sentinel' | null>(null); // 选中的团队（用于弹窗）
  const [enabledTeam, setEnabledTeam] = useState<'marketing' | 'service' | 'sentinel' | null>(null); // 已启用的团队
  const [isAtBottom, setIsAtBottom] = useState(true); // 是否在底部
  const scrollElementRef = useRef<HTMLDivElement | null>(null); // 存储滚动元素的引用
  const minLoading = useMinLoading(loading && messages.length > 0);
  const { contentRef, scrollRef, scrollToBottom } = useStickToBottomInstant(currentSessionKey);

  // Load data when gateway is running.
  // When the store already holds messages for this session (i.e. the user
  // is navigating *back* to Chat), use quiet mode so the existing messages
  // stay visible while fresh data loads in the background.  This avoids
  // an unnecessary messages → spinner → messages flicker.
  useEffect(() => {
    return () => {
      // If the user navigates away without sending any messages, remove the
      // empty session so it doesn't linger as a ghost entry in the sidebar.
      cleanupEmptySession();
    };
  }, [cleanupEmptySession]);

  useEffect(() => {
    void fetchAgents();
  }, [fetchAgents]);

  // 当切换到新会话（消息为空）时，默认打开所有技能面板
  useEffect(() => {
    if (messages.length === 0) {
      setShowSkillPanel(true);
      setActiveTab('all');
    }
  }, [currentSessionKey, messages.length]);

  // Update timestamp when sending starts
  useEffect(() => {
    if (sending && streamingTimestamp === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStreamingTimestamp(Date.now() / 1000);
    } else if (!sending && streamingTimestamp !== 0) {
      setStreamingTimestamp(0);
    }
  }, [sending, streamingTimestamp]);

  // Handle scroll event
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const threshold = 100; // 距离底部100px以内认为在底部
    const atBottom = target.scrollHeight - target.scrollTop - target.clientHeight < threshold;
    setIsAtBottom(atBottom);
  };

  // Initialize scroll position check
  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;

    const checkScrollPosition = () => {
      const threshold = 100;
      const atBottom = scrollElement.scrollHeight - scrollElement.scrollTop - scrollElement.clientHeight < threshold;
      setIsAtBottom(atBottom);
    };

    checkScrollPosition();
    scrollElementRef.current = scrollElement;
  }, [currentSessionKey]);

  // Auto scroll to bottom when new message arrives
  useEffect(() => {
    if (sending && isAtBottom) {
      scrollToBottom();
    }
  }, [messages.length, streamingMessage, sending, isAtBottom, scrollToBottom]);

  // Gateway not running block has been completely removed so the UI always renders.

  const streamMsg = streamingMessage && typeof streamingMessage === 'object'
    ? streamingMessage as unknown as { role?: string; content?: unknown; timestamp?: number }
    : null;
  const streamText = streamMsg ? extractText(streamMsg) : (typeof streamingMessage === 'string' ? streamingMessage : '');
  const hasStreamText = streamText.trim().length > 0;
  const streamThinking = streamMsg ? extractThinking(streamMsg) : null;
  const hasStreamThinking = showThinking && !!streamThinking && streamThinking.trim().length > 0;
  const streamTools = streamMsg ? extractToolUse(streamMsg) : [];
  const hasStreamTools = streamTools.length > 0;
  const streamImages = streamMsg ? extractImages(streamMsg) : [];
  const hasStreamImages = streamImages.length > 0;
  const hasStreamToolStatus = streamingTools.length > 0;
  const shouldRenderStreaming = sending && (hasStreamText || hasStreamThinking || hasStreamTools || hasStreamImages || hasStreamToolStatus);
  const hasAnyStreamContent = hasStreamText || hasStreamThinking || hasStreamTools || hasStreamImages || hasStreamToolStatus;

  const isEmpty = messages.length === 0 && !sending;

  // 团队成员详细信息
  const teamDetails = {
    marketing: {
      name: '一人营销',
      icon: '📢',
      color: 'blue',
      description: '自动完成高潜力客户识别、多渠道触达与跟进闭环，减少小二在筛选、邀约和初步沟通上的重复投入。',
      skills: [
        { name: '历史跟进记录查询', icon: '📋' },
        { name: '客户活跃行为查询', icon: '📊' },
        { name: '广告消耗数据查询', icon: '💰' },
        { name: '流量波动数据查询', icon: '📈' },
        { name: '跟进切入点推荐', icon: '💡' },
        { name: '单客户外呼触发', icon: '📞' },
        { name: '客户意愿初步分层', icon: '🎯' },
        { name: '邀约状态自动更新', icon: '✅' },
      ]
    },
    service: {
      name: '一人服务',
      icon: '🤝',
      color: 'emerald',
      description: '自动维护客户关键信息、记录互动内容、提取待办任务并及时提醒，保障客情连续性与服务响应质量。',
      skills: [
        { name: 'CRM打标信息查询', icon: '🏷️' },
        { name: '小记关键词检索', icon: '🔍' },
        { name: '联系方式有效性验证', icon: '✓' },
        { name: '通话内容摘要生成', icon: '📝' },
        { name: '下次跟进点提取', icon: '🎯' },
        { name: 'CRM小记自动写入', icon: '✍️' },
        { name: '跟进任务自动登记', icon: '📌' },
        { name: '钉钉日程自动创建', icon: '📅' },
        { name: '预警消息自动推送', icon: '🔔' },
      ]
    },
    sentinel: {
      name: '定时哨兵',
      icon: '⏰',
      color: 'amber',
      description: '每早8点定时监控库内客户经营与行为变化，实时识别机会或风险信号并主动预警，实现从静态标签到动态感知的升级。',
      skills: [
        { name: '客户活跃行为查询', icon: '📊' },
        { name: '广告消耗数据查询', icon: '💰' },
        { name: '活动报名记录查询', icon: '📋' },
        { name: '流量波动数据查询', icon: '📈' },
        { name: '经营波动预警判断', icon: '⚠️' },
        { name: '高意愿信号识别', icon: '🎯' },
        { name: '预警消息自动推送', icon: '🔔' },
      ]
    }
  };

  // 主界面展示的技能列表
  const featuredSkills = [
    {
      id: 'search-public-merchants',
      name: '公海商家查询',
      icon: '🌊',
      description: '根据多种条件搜索和筛选公共库内的商家。支持"找上海的服装工厂"、"筛选L4以上的实力商家"等自然语言查询，支持模糊匹配和语义理解。'
    },
    {
      id: 'search-private-merchants',
      name: '私库商家查询',
      icon: '🏪',
      description: '根据多种条件搜索和筛选私库内的商家。支持"帮我找下我的库内上海的服装工厂"等自然语言查询，此技能支持模糊匹配和语义理解。'
    },
    {
      id: 'merchant-detail',
      name: '商家详情',
      icon: '📊',
      description: '根据商家Id查询商家详情信息，包括店铺、广告、商品等数据。'
    },
    {
      id: 'business-profile',
      name: '生意档案',
      icon: '📈',
      description: '查询商家生意档案（含经营/市场/供给分析建议）'
    },
    {
      id: 'cross-platform-data',
      name: '全网经营数据',
      icon: '🌐',
      description: '根据商家名称查询全平台经营信息（跨平台开店/投入/经营情况）'
    },
    {
      id: 'ai-call',
      name: '数字人外呼',
      icon: '📞',
      description: '对指定商家发起外呼（拨打电话）触达'
    },
    {
      id: 'wangwang-message',
      name: '旺旺消息',
      icon: '💬',
      description: '向客户旺旺发送预设模板消息'
    },
    {
      id: 'create-opportunity',
      name: '创建入库机会',
      icon: '➕',
      description: '根据公司名和联系方式，创建入库机会，生成global_id'
    },
  ];

  const skillButtons = [
    { id: 'search-merchant', label: '商家搜索', icon: Search },
    { id: 'instruction_generator_uploader', label: '指令生成', icon: FileText },
    { id: 'outbound_call', label: '外呼', icon: Phone },
  ];

  const toggleSkill = (skillId: string) => {
    setSelectedSkills(prev =>
      prev.includes(skillId)
        ? prev.filter(id => id !== skillId)
        : [...prev, skillId]
    );
  };

  const removeSkill = (skillId: string) => {
    setSelectedSkills(prev => prev.filter(id => id !== skillId));
  };

  return (
    <div className={cn("relative flex flex-col -m-6 transition-colors duration-500 bg-[#FFFFFF] dark:bg-background")} style={{ height: 'calc(100vh - 2.5rem)' }}>
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-end px-4 py-2">
        <ChatToolbar />
      </div>

      {isEmpty ? (
        /* Welcome Layout - fixed top section + scrollable skill panel */
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Fixed Top Section: Welcome Image + Input + Tabs (不会移动) */}
          <div className="flex-shrink-0 flex flex-col items-center px-4 pt-16 pb-6">
            {/* Welcome Image - 固定在顶部 */}
            <div className="mb-8">
              <img
                src={welcomeImg}
                alt="AimiClaw Welcome"
                className="w-80 h-auto object-contain pointer-events-none"
              />
            </div>

            {/* Input Box - 固定位置 */}
            <div className="w-full max-w-3xl">
              {/* Selected Skills Status Bar */}
              {selectedSkills.length > 0 && (
                <div className="mb-3 flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-muted-foreground">已选用技能：</span>
                  {selectedSkills.map(skillId => {
                    const skill = featuredSkills.find(s => s.id === skillId);
                    return (
                      <Badge
                        key={skillId}
                        variant="secondary"
                        className="group relative flex items-center gap-1 pr-2 bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                      >
                        <span className="text-sm">{skill?.icon}</span>
                        <span className="text-sm font-medium">{skill?.name}</span>
                        <button
                          onClick={() => removeSkill(skillId)}
                          className="ml-1 opacity-60 hover:opacity-100 transition-opacity"
                        >
                          ✕
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}

              {/* Enabled Team Status Bar */}
              {enabledTeam && (
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">已选用团队服务：</span>
                  <Badge
                    variant="secondary"
                    className={cn(
                      "flex items-center gap-1 pr-2 group",
                      enabledTeam === 'marketing' && "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
                      enabledTeam === 'service' && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
                      enabledTeam === 'sentinel' && "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                    )}
                  >
                    <span className="text-2xl">{teamDetails[enabledTeam].icon}</span>
                    <span className="text-sm font-medium">{teamDetails[enabledTeam].name}</span>
                    <button
                      onClick={() => setEnabledTeam(null)}
                      className="ml-1 opacity-60 hover:opacity-100 transition-opacity"
                    >
                      ✕
                    </button>
                  </Badge>
                </div>
              )}

              <ChatInput
                onSend={sendMessage}
                onStop={abortRun}
                disabled={!isGatewayRunning}
                sending={sending}
                isEmpty={isEmpty}
                selectedSkills={selectedSkills}
                onRemoveSkill={removeSkill}
              />

              {/* Skill Tabs - 固定在输入框下方 */}
              <div className="flex items-center justify-center gap-4 mt-6">
                <button
                  onClick={() => {
                    setShowSkillPanel(!showSkillPanel || activeTab !== 'all');
                    setActiveTab('all');
                  }}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                    activeTab === 'all' && showSkillPanel
                      ? "text-foreground bg-black/5 dark:bg-white/5"
                      : "text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
                  )}
                >
                  <Zap className="h-4 w-4" />
                  所有技能
                </button>
                <button
                  onClick={() => {
                    setShowSkillPanel(!showSkillPanel || activeTab !== 'team');
                    setActiveTab('team');
                  }}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                    activeTab === 'team' && showSkillPanel
                      ? "text-foreground bg-black/5 dark:bg-white/5"
                      : "text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
                  )}
                >
                  <Flame className="h-4 w-4" />
                  一人团队
                </button>
              </div>
            </div>
          </div>

          {/* Scrollable Skill Panel - 独立滚动区域 */}
          <div className="flex-1 overflow-y-auto">
            {showSkillPanel && (
              <div className="w-full px-4 pb-8">
                <div className="w-full max-w-6xl mx-auto">
                  {activeTab === 'all' && (
                    <>
                      {/* Skill Cards Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                        {featuredSkills.map((skill) => (
                          <button
                            key={skill.id}
                            onClick={() => toggleSkill(skill.id)}
                            className={cn(
                              "group relative flex flex-col items-start p-4 rounded-xl border hover:border-primary/50 hover:shadow-md transition-all text-left",
                              selectedSkills.includes(skill.id)
                                ? "border-primary/50 bg-primary/5 dark:bg-primary/10 ring-2 ring-primary/20"
                                : "border-black/10 dark:border-white/10 bg-white dark:bg-black/5"
                            )}
                          >
                            {/* Icon */}
                            <div className="text-3xl mb-3">{skill.icon}</div>

                            {/* Name */}
                            <h3 className="text-sm font-semibold mb-2 text-foreground group-hover:text-primary transition-colors">
                              {skill.name}
                            </h3>

                            {/* Description */}
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {skill.description}
                            </p>

                            {/* Selected indicator */}
                            {selectedSkills.includes(skill.id) && (
                              <div className="absolute top-2 right-2 text-primary">
                                <Zap className="h-4 w-4" />
                              </div>
                            )}
                          </button>
                        ))}
                      </div>

                      {/* View All Skills Button */}
                      <div className="flex justify-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate('/skills')}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          查看所有技能
                        </Button>
                      </div>
                    </>
                  )}

                  {activeTab === 'team' && (
                    <>
                      {/* Team Member Cards Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
                        {/* 一人营销 */}
                        <button
                          onClick={() => setSelectedTeam('marketing')}
                          className="group relative flex flex-col rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-black/5 hover:shadow-xl transition-all overflow-hidden text-left"
                        >
                          {/* Illustration Background */}
                          <div className="relative h-48 flex items-center justify-center overflow-hidden">
                            <img
                              src={marketingTeamBg}
                              alt="一人营销"
                              className="absolute inset-0 w-full h-full object-cover"
                            />
                          </div>

                          {/* Content */}
                          <div className="p-5 bg-white dark:bg-black/5">
                            <div className="flex items-start justify-between mb-3">
                              <h3 className="text-lg font-bold text-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                一人营销
                              </h3>
                              <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                                智能助手
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                              自动化营销推广，智能内容生成，多渠道投放管理，数据分析优化
                            </p>
                          </div>
                        </button>

                        {/* 一人服务 */}
                        <button
                          onClick={() => setSelectedTeam('service')}
                          className="group relative flex flex-col rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-black/5 hover:shadow-xl transition-all overflow-hidden text-left"
                        >
                          {/* Illustration Background */}
                          <div className="relative h-48 flex items-center justify-center overflow-hidden">
                            <img
                              src={serviceTeamBg}
                              alt="一人服务"
                              className="absolute inset-0 w-full h-full object-cover"
                            />
                          </div>

                          {/* Content */}
                          <div className="p-5 bg-white dark:bg-black/5">
                            <div className="flex items-start justify-between mb-3">
                              <h3 className="text-lg font-bold text-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                                一人服务
                              </h3>
                              <Badge variant="secondary" className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                                智能助手
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                              智能客服系统，自动响应客户咨询，问题分类处理，服务质量监控
                            </p>
                          </div>
                        </button>

                        {/* 定时哨兵 */}
                        <button
                          onClick={() => setSelectedTeam('sentinel')}
                          className="group relative flex flex-col rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-black/5 hover:shadow-xl transition-all overflow-hidden text-left"
                        >
                          {/* Illustration Background */}
                          <div className="relative h-48 flex items-center justify-center overflow-hidden">
                            <img
                              src={sentinelTeamBg}
                              alt="定时哨兵"
                              className="absolute inset-0 w-full h-full object-cover"
                            />
                          </div>

                          {/* Content */}
                          <div className="p-5 bg-white dark:bg-black/5">
                            <div className="flex items-start justify-between mb-3">
                              <h3 className="text-lg font-bold text-foreground group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                                定时哨兵
                              </h3>
                              <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                                自动任务
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                              定时任务监控，自动数据同步，异常预警通知，业务流程自动化
                            </p>
                          </div>
                        </button>
                      </div>

                      {/* View All Team Button */}
                      <div className="flex justify-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate('/agents')}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          查看所有团队成员
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Messages Area */}
          <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 py-4">
            <div ref={contentRef} className="max-w-4xl mx-auto space-y-4">
              {messages.map((msg, idx) => (
                <ChatMessage
                  key={msg.id || `msg-${idx}`}
                  message={msg}
                  showThinking={showThinking}
                />
              ))}

              {/* Streaming message */}
              {shouldRenderStreaming && (
                <ChatMessage
                  message={(streamMsg
                    ? {
                        ...(streamMsg as Record<string, unknown>),
                        role: (typeof streamMsg.role === 'string' ? streamMsg.role : 'assistant') as RawMessage['role'],
                        content: streamMsg.content ?? streamText,
                        timestamp: streamMsg.timestamp ?? streamingTimestamp,
                      }
                    : {
                        role: 'assistant',
                        content: streamText,
                        timestamp: streamingTimestamp,
                      }) as RawMessage}
                  showThinking={showThinking}
                  isStreaming
                  streamingTools={streamingTools}
                />
              )}

              {/* Activity indicator: waiting for next AI turn after tool execution */}
              {sending && pendingFinal && !shouldRenderStreaming && (
                <ActivityIndicator phase="tool_processing" />
              )}

              {/* Typing indicator when sending but no stream content yet */}
              {sending && !pendingFinal && !hasAnyStreamContent && (
                <TypingIndicator />
              )}
            </div>
          </div>

          {/* Error bar */}
          {error && (
            <div className="px-4 py-2 bg-destructive/10 border-t border-destructive/20">
              <div className="max-w-4xl mx-auto flex items-center justify-between">
                <p className="text-sm text-destructive flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </p>
                <button
                  onClick={clearError}
                  className="text-xs text-destructive/60 hover:text-destructive underline"
                >
                  {t('common:actions.dismiss')}
                </button>
              </div>
            </div>
          )}

          {/* Scroll to bottom button */}
          {!isAtBottom && (
            <div className="flex justify-center py-2">
              <Button
                variant="outline"
                size="sm"
                onClick={scrollToBottom}
                className="gap-2 bg-white/80 dark:bg-black/80 backdrop-blur-sm border-border/50"
              >
                <ArrowDown className="h-4 w-4" />
                回到最新消息
              </Button>
            </div>
          )}

          {/* Input Area */}
          <ChatInput
            onSend={sendMessage}
            onStop={abortRun}
            disabled={!isGatewayRunning}
            sending={sending}
            isEmpty={isEmpty}
          />
        </>
      )}

      {/* Transparent loading overlay */}
      {minLoading && !sending && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/20 backdrop-blur-[1px] rounded-xl pointer-events-auto">
          <div className="bg-background shadow-lg rounded-full p-2.5 border border-border">
            <LoadingSpinner size="md" />
          </div>
        </div>
      )}

      {/* Team Detail Dialog */}
      {selectedTeam && teamDetails[selectedTeam] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectedTeam(null)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setSelectedTeam(null);
            }
          }}
        >
          <div
            className={cn(
              "mx-4 max-w-4xl w-full max-h-[90vh] rounded-2xl border shadow-2xl overflow-hidden",
              "bg-card focus:outline-none"
            )}
            onClick={(e) => e.stopPropagation()}
            tabIndex={-1}
          >
            {/* Header with gradient background */}
            <div className="relative p-8 pb-6">
              {/* Background images for team headers */}
              {selectedTeam === 'marketing' && (
                <img
                  src={marketingTeamBg}
                  alt="一人营销"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              )}
              {selectedTeam === 'service' && (
                <img
                  src={serviceTeamBg}
                  alt="一人服务"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              )}
              {selectedTeam === 'sentinel' && (
                <img
                  src={sentinelTeamBg}
                  alt="定时哨兵"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              )}

              {/* Close button */}
              <button
                onClick={() => setSelectedTeam(null)}
                className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-white/80 dark:bg-black/80 hover:bg-white dark:hover:bg-black flex items-center justify-center text-foreground/60 hover:text-foreground transition-all"
              >
                ✕
              </button>

              <div className="relative flex items-center gap-5">
                <div className="text-7xl filter drop-shadow-lg">{teamDetails[selectedTeam].icon}</div>
                <div className="flex-1">
                  <h2 className="text-3xl font-bold mb-2 text-foreground">
                    {teamDetails[selectedTeam].name}
                  </h2>
                  <Badge
                    variant="secondary"
                    className={cn(
                      "text-xs",
                      selectedTeam === 'marketing' && "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
                      selectedTeam === 'service' && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
                      selectedTeam === 'sentinel' && "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
                    )}
                  >
                    {selectedTeam === 'sentinel' ? '自动任务' : '智能助手'}
                  </Badge>
                </div>
              </div>

              <p className="mt-4 text-base leading-relaxed text-foreground/80 relative">
                {teamDetails[selectedTeam].description}
              </p>
            </div>

            {/* Content area with scrolling */}
            <div className={cn(
              "p-8 overflow-y-auto max-h-[calc(90vh-240px)]",
              selectedTeam === 'service' ? "bg-transparent" : "bg-background"
            )}>
              {/* Skills Grid */}
              <div>
                <h3 className="text-lg font-semibold mb-4 text-foreground flex items-center gap-2">
                  <span>包含技能</span>
                  <Badge variant="outline" className="text-xs">
                    {teamDetails[selectedTeam].skills.length}
                  </Badge>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {teamDetails[selectedTeam].skills.map((skill, index) => (
                    <div
                      key={index}
                      className={cn(
                        "flex items-center gap-3 p-4 rounded-xl border transition-all hover:shadow-md cursor-pointer",
                        selectedTeam === 'marketing' && "bg-blue-50/50 dark:bg-blue-950/10 border-blue-200/50 dark:border-blue-800/30 hover:border-blue-400 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/20",
                        selectedTeam === 'service' && "bg-white/40 dark:bg-white/10 border-white/30 dark:border-white/20 hover:border-white/50 dark:hover:border-white/30 hover:bg-white/50 dark:hover:bg-white/15",
                        selectedTeam === 'sentinel' && "bg-amber-50/50 dark:bg-amber-950/10 border-amber-200/50 dark:border-amber-800/30 hover:border-amber-400 dark:hover:border-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/20"
                      )}
                    >
                      <div className="text-2xl">{skill.icon}</div>
                      <div className="text-sm font-medium text-foreground">{skill.name}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer with action buttons */}
            <div className={cn(
              "p-6 border-t",
              selectedTeam === 'service' ? "bg-transparent border-white/10" : "bg-muted/30"
            )}>
              <div className="flex gap-3">
                <Button
                  className={cn(
                    "flex-1",
                    selectedTeam === 'marketing' && "bg-blue-600 hover:bg-blue-700",
                    selectedTeam === 'service' && "bg-emerald-600 hover:bg-emerald-700",
                    selectedTeam === 'sentinel' && "bg-amber-600 hover:bg-amber-700"
                  )}
                  onClick={() => {
                    setEnabledTeam(selectedTeam);
                    setSelectedTeam(null);
                    setShowSkillPanel(true);
                    setActiveTab('all');
                  }}
                >
                  启用团队
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    console.log(`配置${teamDetails[selectedTeam].name}`);
                    // TODO: 实现配置团队逻辑
                  }}
                >
                  配置
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setSelectedTeam(null)}
                >
                  关闭
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Typing Indicator ────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full mt-1 bg-black/5 dark:bg-white/5 text-foreground">
        <Sparkles className="h-4 w-4" />
      </div>
      <div className="bg-black/5 dark:bg-white/5 text-foreground rounded-2xl px-4 py-3">
        <div className="flex gap-1">
          <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}

// ── Activity Indicator (shown between tool cycles) ─────────────

function ActivityIndicator({ phase }: { phase: 'tool_processing' }) {
  void phase;
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full mt-1 bg-black/5 dark:bg-white/5 text-foreground">
        <Sparkles className="h-4 w-4" />
      </div>
      <div className="bg-black/5 dark:bg-white/5 text-foreground rounded-2xl px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          <span>Processing tool results…</span>
        </div>
      </div>
    </div>
  );
}

export default Chat;
