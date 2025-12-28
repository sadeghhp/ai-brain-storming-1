// ============================================
// AI Brainstorm - Secretary Agent
// Version: 2.4.1
// ============================================

import { Agent } from './agent';
import { llmRouter } from '../llm/llm-router';
import { buildSummaryPrompt, buildDistillationPrompt, parseDistillationResponse } from '../llm/prompt-builder';
import { resultDraftStorage, messageStorage, agentStorage, conversationStorage, distilledMemoryStorage } from '../storage/storage-manager';
import { eventBus } from '../utils/event-bus';
import type { Message, ResultDraft, Conversation, Agent as AgentType, DistilledMemory, PinnedFact } from '../types';
import type { LLMMessage } from '../llm/types';

// Secretary neutrality system prompt
const SECRETARY_NEUTRALITY_PROMPT = `You are a NEUTRAL OBSERVER and RECORDER. Your role is to objectively document what was discussed without expressing your own opinions, preferences, or judgments.

CRITICAL RULES:
- Do NOT express opinions or preferences
- Do NOT take sides in disagreements
- Do NOT suggest what "should" be done (unless directly quoting a participant)
- Focus on WHAT was said, not what YOU think should be decided
- Report observations objectively: "Agent A argued that..." rather than "Agent A correctly pointed out..."
- Identify patterns and areas of agreement/disagreement OBJECTIVELY`;

type RoundDecisionFallbackKind = 'noMessages' | 'analysisComplete' | 'parseFail' | 'analysisFailed';

const ROUND_DECISION_FALLBACKS: Record<
  string,
  {
    noMessages: (round: number, rounds: number) => string;
    analysisComplete: () => string;
    parseFail: (rounds: number) => string;
    analysisFailed: (rounds: number) => string;
  }
> = {
  '': {
    noMessages: (round, rounds) => `No messages in round ${round}; defaulting to ${rounds} rounds.`,
    analysisComplete: () => 'Analysis complete.',
    parseFail: (rounds) => `Unable to parse analysis; defaulting to ${rounds} rounds.`,
    analysisFailed: (rounds) => `Analysis failed; defaulting to ${rounds} rounds.`,
  },
  Persian: {
    noMessages: (round, rounds) => `هیچ پیامی در دور ${round} وجود ندارد؛ پیش‌فرض را ${rounds} دور در نظر می‌گیرم.`,
    analysisComplete: () => 'تحلیل انجام شد.',
    parseFail: (rounds) => `امکان پردازش خروجی تحلیل نبود؛ پیش‌فرض را ${rounds} دور در نظر می‌گیرم.`,
    analysisFailed: (rounds) => `تحلیل با خطا مواجه شد؛ پیش‌فرض را ${rounds} دور در نظر می‌گیرم.`,
  },
  Spanish: {
    noMessages: (round, rounds) => `No hay mensajes en la ronda ${round}; usando ${rounds} rondas por defecto.`,
    analysisComplete: () => 'Análisis completado.',
    parseFail: (rounds) => `No se pudo interpretar el análisis; usando ${rounds} rondas por defecto.`,
    analysisFailed: (rounds) => `El análisis falló; usando ${rounds} rondas por defecto.`,
  },
  French: {
    noMessages: (round, rounds) => `Aucun message au tour ${round} ; ${rounds} tours par défaut.`,
    analysisComplete: () => 'Analyse terminée.',
    parseFail: (rounds) => `Impossible d’interpréter l’analyse ; ${rounds} tours par défaut.`,
    analysisFailed: (rounds) => `L’analyse a échoué ; ${rounds} tours par défaut.`,
  },
  German: {
    noMessages: (round, rounds) => `Keine Nachrichten in Runde ${round}; standardmäßig ${rounds} Runden.`,
    analysisComplete: () => 'Analyse abgeschlossen.',
    parseFail: (rounds) => `Analyse konnte nicht geparst werden; standardmäßig ${rounds} Runden.`,
    analysisFailed: (rounds) => `Analyse fehlgeschlagen; standardmäßig ${rounds} Runden.`,
  },
  Italian: {
    noMessages: (round, rounds) => `Nessun messaggio nel round ${round}; impostazione predefinita: ${rounds} round.`,
    analysisComplete: () => 'Analisi completata.',
    parseFail: (rounds) => `Impossibile interpretare l’analisi; impostazione predefinita: ${rounds} round.`,
    analysisFailed: (rounds) => `Analisi non riuscita; impostazione predefinita: ${rounds} round.`,
  },
  Portuguese: {
    noMessages: (round, rounds) => `Sem mensagens na rodada ${round}; usando ${rounds} rodadas por padrão.`,
    analysisComplete: () => 'Análise concluída.',
    parseFail: (rounds) => `Não foi possível interpretar a análise; usando ${rounds} rodadas por padrão.`,
    analysisFailed: (rounds) => `Falha na análise; usando ${rounds} rodadas por padrão.`,
  },
  Dutch: {
    noMessages: (round, rounds) => `Geen berichten in ronde ${round}; standaard ${rounds} rondes.`,
    analysisComplete: () => 'Analyse voltooid.',
    parseFail: (rounds) => `Kon de analyse niet verwerken; standaard ${rounds} rondes.`,
    analysisFailed: (rounds) => `Analyse mislukt; standaard ${rounds} rondes.`,
  },
  Russian: {
    noMessages: (round, rounds) => `В раунде ${round} нет сообщений; по умолчанию ${rounds} раундов.`,
    analysisComplete: () => 'Анализ завершён.',
    parseFail: (rounds) => `Не удалось разобрать анализ; по умолчанию ${rounds} раундов.`,
    analysisFailed: (rounds) => `Анализ не удался; по умолчанию ${rounds} раундов.`,
  },
  'Chinese (Simplified)': {
    noMessages: (round, rounds) => `第${round}轮没有消息；默认使用${rounds}轮。`,
    analysisComplete: () => '分析完成。',
    parseFail: (rounds) => `无法解析分析结果；默认使用${rounds}轮。`,
    analysisFailed: (rounds) => `分析失败；默认使用${rounds}轮。`,
  },
  'Chinese (Traditional)': {
    noMessages: (round, rounds) => `第${round}輪沒有訊息；預設使用${rounds}輪。`,
    analysisComplete: () => '分析完成。',
    parseFail: (rounds) => `無法解析分析結果；預設使用${rounds}輪。`,
    analysisFailed: (rounds) => `分析失敗；預設使用${rounds}輪。`,
  },
  Japanese: {
    noMessages: (round, rounds) => `${round}ラウンドにメッセージがありません。既定で${rounds}ラウンドにします。`,
    analysisComplete: () => '分析が完了しました。',
    parseFail: (rounds) => `分析結果を解析できませんでした。既定で${rounds}ラウンドにします。`,
    analysisFailed: (rounds) => `分析に失敗しました。既定で${rounds}ラウンドにします。`,
  },
  Korean: {
    noMessages: (round, rounds) => `${round}라운드에 메시지가 없습니다. 기본값으로 ${rounds}라운드를 사용합니다.`,
    analysisComplete: () => '분석이 완료되었습니다.',
    parseFail: (rounds) => `분석 결과를 해석할 수 없습니다. 기본값으로 ${rounds}라운드를 사용합니다.`,
    analysisFailed: (rounds) => `분석에 실패했습니다. 기본값으로 ${rounds}라운드를 사용합니다.`,
  },
  Arabic: {
    noMessages: (round, rounds) => `لا توجد رسائل في الجولة ${round}؛ سيتم اعتماد ${rounds} جولات افتراضيًا.`,
    analysisComplete: () => 'اكتمل التحليل.',
    parseFail: (rounds) => `تعذّر تفسير التحليل؛ سيتم اعتماد ${rounds} جولات افتراضيًا.`,
    analysisFailed: (rounds) => `فشل التحليل؛ سيتم اعتماد ${rounds} جولات افتراضيًا.`,
  },
  Hindi: {
    noMessages: (round, rounds) => `${round} राउंड में कोई संदेश नहीं है; डिफ़ॉल्ट रूप से ${rounds} राउंड चुने गए हैं।`,
    analysisComplete: () => 'विश्लेषण पूरा हुआ।',
    parseFail: (rounds) => `विश्लेषण को पार्स नहीं किया जा सका; डिफ़ॉल्ट रूप से ${rounds} राउंड चुने गए हैं।`,
    analysisFailed: (rounds) => `विश्लेषण विफल हुआ; डिफ़ॉल्ट रूप से ${rounds} राउंड चुने गए हैं।`,
  },
  Turkish: {
    noMessages: (round, rounds) => `${round}. turda mesaj yok; varsayılan olarak ${rounds} tur seçildi.`,
    analysisComplete: () => 'Analiz tamamlandı.',
    parseFail: (rounds) => `Analiz çözümlenemedi; varsayılan olarak ${rounds} tur seçildi.`,
    analysisFailed: (rounds) => `Analiz başarısız oldu; varsayılan olarak ${rounds} tur seçildi.`,
  },
  Polish: {
    noMessages: (round, rounds) => `Brak wiadomości w rundzie ${round}; domyślnie ${rounds} rundy.`,
    analysisComplete: () => 'Analiza zakończona.',
    parseFail: (rounds) => `Nie udało się sparsować analizy; domyślnie ${rounds} rundy.`,
    analysisFailed: (rounds) => `Analiza nie powiodła się; domyślnie ${rounds} rundy.`,
  },
  Swedish: {
    noMessages: (round, rounds) => `Inga meddelanden i runda ${round}; använder ${rounds} rundor som standard.`,
    analysisComplete: () => 'Analysen är klar.',
    parseFail: (rounds) => `Kunde inte tolka analysen; använder ${rounds} rundor som standard.`,
    analysisFailed: (rounds) => `Analysen misslyckades; använder ${rounds} rundor som standard.`,
  },
  Norwegian: {
    noMessages: (round, rounds) => `Ingen meldinger i runde ${round}; bruker ${rounds} runder som standard.`,
    analysisComplete: () => 'Analysen er fullført.',
    parseFail: (rounds) => `Kunne ikke tolke analysen; bruker ${rounds} runder som standard.`,
    analysisFailed: (rounds) => `Analysen mislyktes; bruker ${rounds} runder som standard.`,
  },
  Danish: {
    noMessages: (round, rounds) => `Ingen beskeder i runde ${round}; bruger ${rounds} runder som standard.`,
    analysisComplete: () => 'Analysen er fuldført.',
    parseFail: (rounds) => `Kunne ikke fortolke analysen; bruger ${rounds} runder som standard.`,
    analysisFailed: (rounds) => `Analysen mislykkedes; bruger ${rounds} runder som standard.`,
  },
  Finnish: {
    noMessages: (round, rounds) => `Ei viestejä kierroksella ${round}; käytetään oletuksena ${rounds} kierrosta.`,
    analysisComplete: () => 'Analyysi valmis.',
    parseFail: (rounds) => `Analyysiä ei voitu jäsentää; käytetään oletuksena ${rounds} kierrosta.`,
    analysisFailed: (rounds) => `Analyysi epäonnistui; käytetään oletuksena ${rounds} kierrosta.`,
  },
  Greek: {
    noMessages: (round, rounds) => `Δεν υπάρχουν μηνύματα στον γύρο ${round}; προεπιλογή ${rounds} γύροι.`,
    analysisComplete: () => 'Η ανάλυση ολοκληρώθηκε.',
    parseFail: (rounds) => `Δεν ήταν δυνατή η ερμηνεία του αποτελέσματος· προεπιλογή ${rounds} γύροι.`,
    analysisFailed: (rounds) => `Η ανάλυση απέτυχε· προεπιλογή ${rounds} γύροι.`,
  },
  Hebrew: {
    noMessages: (round, rounds) => `אין הודעות בסבב ${round}; ברירת מחדל: ${rounds} סבבים.`,
    analysisComplete: () => 'הניתוח הושלם.',
    parseFail: (rounds) => `לא ניתן היה לפרש את הניתוח; ברירת מחדל: ${rounds} סבבים.`,
    analysisFailed: (rounds) => `הניתוח נכשל; ברירת מחדל: ${rounds} סבבים.`,
  },
  Thai: {
    noMessages: (round, rounds) => `ไม่มีข้อความในรอบที่ ${round}; ใช้ค่าเริ่มต้นเป็น ${rounds} รอบ`,
    analysisComplete: () => 'การวิเคราะห์เสร็จสิ้น',
    parseFail: (rounds) => `ไม่สามารถแยกวิเคราะห์ผลได้; ใช้ค่าเริ่มต้นเป็น ${rounds} รอบ`,
    analysisFailed: (rounds) => `การวิเคราะห์ล้มเหลว; ใช้ค่าเริ่มต้นเป็น ${rounds} รอบ`,
  },
  Vietnamese: {
    noMessages: (round, rounds) => `Không có tin nhắn ở vòng ${round}; mặc định chọn ${rounds} vòng.`,
    analysisComplete: () => 'Phân tích hoàn tất.',
    parseFail: (rounds) => `Không thể phân tích kết quả; mặc định chọn ${rounds} vòng.`,
    analysisFailed: (rounds) => `Phân tích thất bại; mặc định chọn ${rounds} vòng.`,
  },
  Indonesian: {
    noMessages: (round, rounds) => `Tidak ada pesan pada ronde ${round}; default menggunakan ${rounds} ronde.`,
    analysisComplete: () => 'Analisis selesai.',
    parseFail: (rounds) => `Tidak dapat mengurai analisis; default menggunakan ${rounds} ronde.`,
    analysisFailed: (rounds) => `Analisis gagal; default menggunakan ${rounds} ronde.`,
  },
  Czech: {
    noMessages: (round, rounds) => `V kole ${round} nejsou žádné zprávy; výchozí je ${rounds} kol.`,
    analysisComplete: () => 'Analýza dokončena.',
    parseFail: (rounds) => `Nepodařilo se zpracovat analýzu; výchozí je ${rounds} kol.`,
    analysisFailed: (rounds) => `Analýza selhala; výchozí je ${rounds} kol.`,
  },
  Hungarian: {
    noMessages: (round, rounds) => `Nincs üzenet a(z) ${round}. körben; alapértelmezés: ${rounds} kör.`,
    analysisComplete: () => 'Az elemzés elkészült.',
    parseFail: (rounds) => `Nem sikerült értelmezni az elemzést; alapértelmezés: ${rounds} kör.`,
    analysisFailed: (rounds) => `Az elemzés sikertelen; alapértelmezés: ${rounds} kör.`,
  },
  Romanian: {
    noMessages: (round, rounds) => `Nu există mesaje în runda ${round}; implicit ${rounds} runde.`,
    analysisComplete: () => 'Analiza este completă.',
    parseFail: (rounds) => `Nu s-a putut interpreta analiza; implicit ${rounds} runde.`,
    analysisFailed: (rounds) => `Analiza a eșuat; implicit ${rounds} runde.`,
  },
  Ukrainian: {
    noMessages: (round, rounds) => `У раунді ${round} немає повідомлень; за замовчуванням ${rounds} раундів.`,
    analysisComplete: () => 'Аналіз завершено.',
    parseFail: (rounds) => `Не вдалося розібрати аналіз; за замовчуванням ${rounds} раундів.`,
    analysisFailed: (rounds) => `Аналіз не вдався; за замовчуванням ${rounds} раундів.`,
  },
  Bengali: {
    noMessages: (round, rounds) => `রাউন্ড ${round}-এ কোনো বার্তা নেই; ডিফল্টভাবে ${rounds} রাউন্ড নির্ধারণ করা হলো।`,
    analysisComplete: () => 'বিশ্লেষণ সম্পন্ন।',
    parseFail: (rounds) => `বিশ্লেষণ পার্স করা যায়নি; ডিফল্টভাবে ${rounds} রাউন্ড নির্ধারণ করা হলো।`,
    analysisFailed: (rounds) => `বিশ্লেষণ ব্যর্থ হয়েছে; ডিফল্টভাবে ${rounds} রাউন্ড নির্ধারণ করা হলো।`,
  },
};

/**
 * Secretary Agent
 * Specialized agent that:
 * - Observes and summarizes discussions neutrally
 * - Generates round-by-round summaries visible to other agents
 * - Produces structured final result documents
 * - Does NOT express opinions or participate in debates
 */
export class SecretaryAgent {
  private agent: Agent;
  private conversationId: string;

  constructor(agent: Agent) {
    if (!agent.isSecretary) {
      throw new Error('Agent is not a secretary');
    }
    this.agent = agent;
    this.conversationId = agent.conversationId;
  }

  get id(): string {
    return this.agent.id;
  }

  get name(): string {
    return this.agent.name;
  }

  private getRoundDecisionFallbackReasoning(params: {
    targetLanguage?: string;
    kind: RoundDecisionFallbackKind;
    completedRound?: number;
    rounds: number;
  }): string {
    const key = (params.targetLanguage ?? '').trim();
    const pack = ROUND_DECISION_FALLBACKS[key] ?? ROUND_DECISION_FALLBACKS[''];

    switch (params.kind) {
      case 'noMessages': {
        const round = params.completedRound ?? 1;
        return pack.noMessages(round, params.rounds);
      }
      case 'analysisComplete':
        return pack.analysisComplete();
      case 'parseFail':
        return pack.parseFail(params.rounds);
      case 'analysisFailed':
        return pack.analysisFailed(params.rounds);
      default:
        return ROUND_DECISION_FALLBACKS[''].analysisFailed(params.rounds);
    }
  }

  /**
   * Generate a summary of the current discussion
   */
  async generateSummary(messages: Message[]): Promise<string> {
    if (messages.length === 0) {
      return 'No discussion to summarize yet.';
    }

    const conversation = await conversationStorage.getById(this.conversationId);
    const agents = await agentStorage.getByConversation(this.conversationId);
    const prompt = buildSummaryPrompt(messages, agents, conversation?.targetLanguage);

    this.agent.setStatus('thinking');

    try {
      const response = await llmRouter.complete(this.agent.llmProviderId, {
        model: this.agent.modelId,
        messages: prompt,
        temperature: 0.3, // Low temperature for accurate summarization
        maxTokens: 1000,
      });

      this.agent.setStatus('idle');
      return response.content;
    } catch (error) {
      this.agent.setStatus('idle');
      console.error('[Secretary] Failed to generate summary:', error);
      throw error;
    }
  }

  /**
   * Generate a neutral round summary that will be visible to all agents
   * This summary is stored as a system message so agents can reference it
   */
  async generateRoundSummary(round: number): Promise<string> {
    const messages = await messageStorage.getByRound(this.conversationId, round);
    
    if (messages.length === 0) {
      return '';
    }

    const conversation = await conversationStorage.getById(this.conversationId);
    const targetLanguage = conversation?.targetLanguage;
    const agents = await agentStorage.getByConversation(this.conversationId);

    const prompt: LLMMessage[] = [
      {
        role: 'system',
        content: `${SECRETARY_NEUTRALITY_PROMPT}

${targetLanguage ? `\nLANGUAGE REQUIREMENT: Write the entire summary in ${targetLanguage}.\n` : ''}

You are summarizing Round ${round} of a discussion. Create a brief, neutral summary that:
1. Lists the main points each participant made (attribute by name)
2. Notes any areas of agreement observed
3. Notes any areas of disagreement observed
4. Identifies any emerging themes

Keep it concise (2-4 paragraphs). Other participants will see this summary before the next round.`,
      },
      {
        role: 'user',
        content: this.formatMessagesForSummary(messages, agents),
      },
    ];

    // Stream into the main conversation UI just like other agents.
    // (Agent.generateStreamingResponse emits: agent:thinking/speaking/idle + stream:chunk/stream:complete)
    // IMPORTANT: Some provider implementations may not reliably send a "done" chunk; we defensively
    // emit stream:complete in finally to ensure the temporary streaming bubble is removed.
    let streamed = '';
    try {
      const response = await this.agent.generateStreamingResponse(prompt, (chunk) => {
        streamed += chunk;
      });

      // Store in round summaries array
      await resultDraftStorage.appendRoundSummary(this.conversationId, response.content || streamed);

      return response.content || streamed;
    } catch (error) {
      console.error('[Secretary] Failed to generate round summary:', error);
      // Avoid injecting English into the conversation when a target language is set.
      return '';
    } finally {
      eventBus.emit('stream:complete', { agentId: this.agent.id });
    }
  }

  /**
   * Analyze the first round and decide how many total rounds are needed
   * Returns the recommended number of rounds (2-10) and reasoning
   */
  async analyzeAndDecideRounds(
    conversation: Conversation,
    completedRound: number
  ): Promise<{ recommendedRounds: number; reasoning: string }> {
    const targetLanguage = conversation.targetLanguage;
    const messages = await messageStorage.getByRound(this.conversationId, completedRound);
    
    if (messages.length === 0) {
      const recommendedRounds = 3;
      return { 
        recommendedRounds,
        reasoning: this.getRoundDecisionFallbackReasoning({
          targetLanguage,
          kind: 'noMessages',
          completedRound,
          rounds: recommendedRounds,
        }),
      };
    }

    const agents = await agentStorage.getByConversation(this.conversationId);

    const prompt: LLMMessage[] = [
      {
        role: 'system',
        content: `${SECRETARY_NEUTRALITY_PROMPT}

You are analyzing the first round of a discussion to determine how many total rounds are needed to reach a productive conclusion.

Topic: ${conversation.subject}
Goal: ${conversation.goal}

${targetLanguage ? `LANGUAGE REQUIREMENT: Write the "reasoning" value in ${targetLanguage}.` : ''}

Analyze the discussion and decide the optimal number of rounds (between 2 and 10) based on:
1. Topic complexity - More complex topics need more rounds
2. Goal progress - How far are participants from achieving the stated goal?
3. Convergence potential - Are participants likely to reach consensus, or is there significant disagreement?
4. Depth of discussion - Are participants exploring surface-level or deep insights?

You MUST respond in this exact JSON format:
{
  "recommendedRounds": <number between 2 and 10>,
  "reasoning": "<brief explanation of your decision>"
}

No other text outside the JSON.`,
      },
      {
        role: 'user',
        content: this.formatMessagesForSummary(messages, agents),
      },
    ];

    this.agent.setStatus('thinking');

    try {
      const response = await llmRouter.complete(this.agent.llmProviderId, {
        model: this.agent.modelId,
        messages: prompt,
        temperature: 0.3, // Low temperature for consistent decision-making
        maxTokens: 300,
      });

      this.agent.setStatus('idle');

      // Parse JSON response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const rounds = Math.min(10, Math.max(2, parseInt(parsed.recommendedRounds, 10) || 5));
        const reasoning =
          typeof parsed.reasoning === 'string' && parsed.reasoning.trim()
            ? parsed.reasoning.trim()
            : this.getRoundDecisionFallbackReasoning({
                targetLanguage,
                kind: 'analysisComplete',
                completedRound,
                rounds,
              });
        return {
          recommendedRounds: rounds,
          reasoning,
        };
      }

      // Fallback if parsing fails
      const recommendedRounds = 5;
      return {
        recommendedRounds,
        reasoning: this.getRoundDecisionFallbackReasoning({
          targetLanguage,
          kind: 'parseFail',
          completedRound,
          rounds: recommendedRounds,
        }),
      };
    } catch (error) {
      this.agent.setStatus('idle');
      console.error('[Secretary] Failed to analyze and decide rounds:', error);
      const recommendedRounds = 5;
      return {
        recommendedRounds,
        reasoning: this.getRoundDecisionFallbackReasoning({
          targetLanguage,
          kind: 'analysisFailed',
          completedRound,
          rounds: recommendedRounds,
        }),
      };
    }
  }

  /**
   * Update the result draft with the latest summary
   */
  async updateResultDraft(summary: string): Promise<ResultDraft> {
    const draft = await resultDraftStorage.update(this.conversationId, {
      summary,
    });

    eventBus.emit('draft:updated', draft);
    return draft;
  }

  /**
   * Generate and store a complete structured result draft
   * Uses multi-step extraction for themes, consensus, disagreements, etc.
   */
  async generateResultDraft(conversation: Conversation): Promise<ResultDraft> {
    const messages = await messageStorage.getByConversation(this.conversationId);
    const agents = await agentStorage.getByConversation(this.conversationId);
    const existingDraft = await resultDraftStorage.get(this.conversationId);

    this.agent.setStatus('thinking');

    try {
      // Step 1: Generate executive summary
      const executiveSummary = await this.extractExecutiveSummaryLLM(conversation, messages, agents);

      // Step 2: Extract themes
      const themes = await this.extractThemes(messages, agents);

      // Step 3: Identify consensus areas
      const consensusAreas = await this.extractConsensus(messages, agents);

      // Step 4: Identify disagreements
      const disagreements = await this.extractDisagreements(messages, agents);

      // Step 5: Generate recommendations (neutral, based on discussion)
      const recommendations = await this.extractRecommendations(conversation, messages, agents);

      // Step 6: Extract action items
      const actionItems = await this.extractActionItems(messages, agents);

      // Step 7: Identify open questions
      const openQuestions = await this.extractOpenQuestions(messages, agents);

      this.agent.setStatus('idle');

      // Build full content for legacy compatibility
      const content = this.buildFullContent({
        executiveSummary,
        themes,
        consensusAreas,
        disagreements,
        recommendations,
        actionItems,
        openQuestions,
      });

      const draft = await resultDraftStorage.update(this.conversationId, {
        content,
        summary: executiveSummary,
        keyDecisions: consensusAreas, // Legacy field mapping
        executiveSummary,
        themes,
        consensusAreas,
        disagreements,
        recommendations,
        actionItems,
        openQuestions,
        roundSummaries: existingDraft?.roundSummaries || [],
      });

      eventBus.emit('draft:updated', draft);
      return draft;
    } catch (error) {
      this.agent.setStatus('idle');
      console.error('[Secretary] Failed to generate result draft:', error);
      throw error;
    }
  }

  /**
   * Generate a comprehensive final result after all rounds complete
   * This is called automatically when the conversation reaches its final round
   * Incorporates all round summaries into a cohesive final document
   */
  async generateFinalComprehensiveResult(conversation: Conversation): Promise<ResultDraft> {
    const messages = await messageStorage.getByConversation(this.conversationId);
    const agents = await agentStorage.getByConversation(this.conversationId);
    const existingDraft = await resultDraftStorage.get(this.conversationId);
    const roundSummaries = existingDraft?.roundSummaries || [];

    this.agent.setStatus('thinking');
    eventBus.emit('agent:thinking', this.agent.id);

    try {
      // Build context from all round summaries
      const roundSummariesText = roundSummaries.length > 0
        // Avoid hardcoded English labels; summaries already include their own structure/language.
        ? roundSummaries.join('\n\n---\n\n')
        : 'No round summaries available.';

      // Step 1: Generate comprehensive executive summary incorporating all rounds
      const executiveSummary = await this.extractFinalExecutiveSummary(
        conversation,
        messages,
        agents,
        roundSummariesText
      );

      // Step 2: Extract final themes across all rounds
      const themes = await this.extractThemes(messages, agents);

      // Step 3: Identify final consensus areas
      const consensusAreas = await this.extractConsensus(messages, agents);

      // Step 4: Identify final disagreements
      const disagreements = await this.extractDisagreements(messages, agents);

      // Step 5: Generate final recommendations
      const recommendations = await this.extractRecommendations(conversation, messages, agents);

      // Step 6: Extract action items
      const actionItems = await this.extractActionItems(messages, agents);

      // Step 7: Identify remaining open questions
      const openQuestions = await this.extractOpenQuestions(messages, agents);

      this.agent.setStatus('idle');
      eventBus.emit('agent:idle', this.agent.id);

      // Build comprehensive final content
      const content = this.buildFinalComprehensiveContent({
        executiveSummary,
        themes,
        consensusAreas,
        disagreements,
        recommendations,
        actionItems,
        openQuestions,
        roundSummaries,
        totalRounds: conversation.currentRound,
        participantCount: agents.filter(a => !a.isSecretary).length,
      });

      const draft = await resultDraftStorage.update(this.conversationId, {
        content,
        summary: executiveSummary,
        keyDecisions: consensusAreas,
        executiveSummary,
        themes,
        consensusAreas,
        disagreements,
        recommendations,
        actionItems,
        openQuestions,
        roundSummaries,
      });

      eventBus.emit('draft:updated', draft);
      return draft;
    } catch (error) {
      this.agent.setStatus('idle');
      eventBus.emit('agent:idle', this.agent.id);
      console.error('[Secretary] Failed to generate final comprehensive result:', error);
      throw error;
    }
  }

  /**
   * Extract a comprehensive executive summary for the final result
   */
  private async extractFinalExecutiveSummary(
    conversation: Conversation,
    messages: Message[],
    agents: AgentType[],
    roundSummariesText: string
  ): Promise<string> {
    const prompt: LLMMessage[] = [
      {
        role: 'system',
        content: `${SECRETARY_NEUTRALITY_PROMPT}

Write a comprehensive executive summary (3-5 sentences) of the entire discussion across all rounds.

Topic: ${conversation.subject}
Goal: ${conversation.goal}
Total Rounds: ${conversation.currentRound}

Focus on:
- The overall arc of the discussion
- Key conclusions reached
- Whether the goal was achieved
- Any significant outcomes or decisions

Be factual and neutral.`,
      },
      {
        role: 'user',
        content: `Round Summaries:\n${roundSummariesText}\n\nFull Discussion:\n${this.formatMessagesForSummary(messages, agents)}`,
      },
    ];

    const response = await llmRouter.complete(this.agent.llmProviderId, {
      model: this.agent.modelId,
      messages: prompt,
      temperature: 0.3,
      maxTokens: 500,
    });

    return response.content;
  }

  /**
   * Build comprehensive final content including round-by-round progress
   */
  private buildFinalComprehensiveContent(sections: {
    executiveSummary: string;
    themes: string[];
    consensusAreas: string;
    disagreements: string;
    recommendations: string;
    actionItems: string;
    openQuestions: string;
    roundSummaries: string[];
    totalRounds: number;
    participantCount: number;
  }): string {
    const parts: string[] = [];

    parts.push('# Final Discussion Result\n');
    
    parts.push('## Overview\n');
    parts.push(`- **Total Rounds:** ${sections.totalRounds}`);
    parts.push(`- **Participants:** ${sections.participantCount}`);
    parts.push('');

    parts.push('## Executive Summary\n');
    parts.push(sections.executiveSummary + '\n');

    if (sections.themes.length > 0) {
      parts.push('## Main Themes\n');
      sections.themes.forEach(theme => parts.push(`- ${theme}`));
      parts.push('');
    }

    parts.push('## Areas of Consensus\n');
    parts.push(sections.consensusAreas + '\n');

    parts.push('## Areas of Disagreement\n');
    parts.push(sections.disagreements + '\n');

    parts.push('## Recommendations\n');
    parts.push(sections.recommendations + '\n');

    parts.push('## Action Items\n');
    parts.push(sections.actionItems + '\n');

    parts.push('## Open Questions\n');
    parts.push(sections.openQuestions + '\n');

    // Add round-by-round summary section
    if (sections.roundSummaries.length > 0) {
      parts.push('## Round-by-Round Progress\n');
      sections.roundSummaries.forEach((summary, index) => {
        parts.push(`### Round ${index + 1}\n`);
        parts.push(summary + '\n');
      });
    }

    return parts.join('\n');
  }

  // ----- Multi-Step Extraction Methods -----

  private async extractExecutiveSummaryLLM(
    conversation: Conversation,
    messages: Message[],
    agents: AgentType[]
  ): Promise<string> {
    const prompt: LLMMessage[] = [
      {
        role: 'system',
        content: `${SECRETARY_NEUTRALITY_PROMPT}

Write a 2-3 sentence executive summary of the discussion.
Topic: ${conversation.subject}
Goal: ${conversation.goal}

Focus on what was discussed and any conclusions reached. Be factual and neutral.`,
      },
      {
        role: 'user',
        content: this.formatMessagesForSummary(messages, agents),
      },
    ];

    const response = await llmRouter.complete(this.agent.llmProviderId, {
      model: this.agent.modelId,
      messages: prompt,
      temperature: 0.3,
      maxTokens: 300,
    });

    return response.content;
  }

  private async extractThemes(messages: Message[], agents: AgentType[]): Promise<string[]> {
    const prompt: LLMMessage[] = [
      {
        role: 'system',
        content: `${SECRETARY_NEUTRALITY_PROMPT}

Identify the 3-5 main themes or topics that emerged in this discussion.
Return ONLY a JSON array of strings, e.g.: ["theme 1", "theme 2", "theme 3"]
No other text.`,
      },
      {
        role: 'user',
        content: this.formatMessagesForSummary(messages, agents),
      },
    ];

    try {
      const response = await llmRouter.complete(this.agent.llmProviderId, {
        model: this.agent.modelId,
        messages: prompt,
        temperature: 0.2,
        maxTokens: 200,
      });

      // Parse JSON array
      const match = response.content.match(/\[[\s\S]*\]/);
      if (match) {
        return JSON.parse(match[0]);
      }
      return [];
    } catch {
      return [];
    }
  }

  private async extractConsensus(messages: Message[], agents: AgentType[]): Promise<string> {
    const prompt: LLMMessage[] = [
      {
        role: 'system',
        content: `${SECRETARY_NEUTRALITY_PROMPT}

Identify areas where participants AGREED or reached consensus.
List each area of agreement as a bullet point.
If no clear consensus was reached, say "No clear consensus areas identified."`,
      },
      {
        role: 'user',
        content: this.formatMessagesForSummary(messages, agents),
      },
    ];

    const response = await llmRouter.complete(this.agent.llmProviderId, {
      model: this.agent.modelId,
      messages: prompt,
      temperature: 0.3,
      maxTokens: 500,
    });

    return response.content;
  }

  private async extractDisagreements(messages: Message[], agents: AgentType[]): Promise<string> {
    const prompt: LLMMessage[] = [
      {
        role: 'system',
        content: `${SECRETARY_NEUTRALITY_PROMPT}

Identify areas where participants DISAGREED or had conflicting views.
For each disagreement, briefly note the different positions without judging which is correct.
If no significant disagreements occurred, say "No significant disagreements identified."`,
      },
      {
        role: 'user',
        content: this.formatMessagesForSummary(messages, agents),
      },
    ];

    const response = await llmRouter.complete(this.agent.llmProviderId, {
      model: this.agent.modelId,
      messages: prompt,
      temperature: 0.3,
      maxTokens: 500,
    });

    return response.content;
  }

  private async extractRecommendations(
    conversation: Conversation,
    messages: Message[],
    agents: AgentType[]
  ): Promise<string> {
    const prompt: LLMMessage[] = [
      {
        role: 'system',
        content: `${SECRETARY_NEUTRALITY_PROMPT}

Based on the discussion, compile recommendations that were suggested by participants.
Goal of discussion: ${conversation.goal}

List recommendations as bullet points, attributing them to who suggested them where possible.
Only include recommendations that were actually discussed - do NOT add your own suggestions.
If no clear recommendations emerged, say "No specific recommendations were proposed."`,
      },
      {
        role: 'user',
        content: this.formatMessagesForSummary(messages, agents),
      },
    ];

    const response = await llmRouter.complete(this.agent.llmProviderId, {
      model: this.agent.modelId,
      messages: prompt,
      temperature: 0.3,
      maxTokens: 500,
    });

    return response.content;
  }

  private async extractActionItems(messages: Message[], agents: AgentType[]): Promise<string> {
    const prompt: LLMMessage[] = [
      {
        role: 'system',
        content: `${SECRETARY_NEUTRALITY_PROMPT}

Extract any specific action items or next steps that were mentioned in the discussion.
Format as bullet points with the action and who mentioned it (if applicable).
If no action items were discussed, say "No specific action items identified."`,
      },
      {
        role: 'user',
        content: this.formatMessagesForSummary(messages, agents),
      },
    ];

    const response = await llmRouter.complete(this.agent.llmProviderId, {
      model: this.agent.modelId,
      messages: prompt,
      temperature: 0.3,
      maxTokens: 400,
    });

    return response.content;
  }

  private async extractOpenQuestions(messages: Message[], agents: AgentType[]): Promise<string> {
    const prompt: LLMMessage[] = [
      {
        role: 'system',
        content: `${SECRETARY_NEUTRALITY_PROMPT}

Identify any questions or issues that were raised but NOT resolved in the discussion.
List them as bullet points.
If all questions were addressed, say "No unresolved questions identified."`,
      },
      {
        role: 'user',
        content: this.formatMessagesForSummary(messages, agents),
      },
    ];

    const response = await llmRouter.complete(this.agent.llmProviderId, {
      model: this.agent.modelId,
      messages: prompt,
      temperature: 0.3,
      maxTokens: 400,
    });

    return response.content;
  }

  private buildFullContent(sections: {
    executiveSummary: string;
    themes: string[];
    consensusAreas: string;
    disagreements: string;
    recommendations: string;
    actionItems: string;
    openQuestions: string;
  }): string {
    const parts: string[] = [];

    parts.push('# Discussion Result\n');
    parts.push('## Executive Summary\n');
    parts.push(sections.executiveSummary + '\n');

    if (sections.themes.length > 0) {
      parts.push('## Main Themes\n');
      sections.themes.forEach(theme => parts.push(`- ${theme}`));
      parts.push('');
    }

    parts.push('## Areas of Consensus\n');
    parts.push(sections.consensusAreas + '\n');

    parts.push('## Areas of Disagreement\n');
    parts.push(sections.disagreements + '\n');

    parts.push('## Recommendations\n');
    parts.push(sections.recommendations + '\n');

    parts.push('## Action Items\n');
    parts.push(sections.actionItems + '\n');

    parts.push('## Open Questions\n');
    parts.push(sections.openQuestions + '\n');

    return parts.join('\n');
  }

  /**
   * Generate an incremental update to the result draft
   */
  async incrementalUpdate(newMessages: Message[]): Promise<ResultDraft> {
    const existingDraft = await resultDraftStorage.get(this.conversationId);
    const agents = await agentStorage.getByConversation(this.conversationId);

    const prompt: LLMMessage[] = [
      {
        role: 'system',
        content: `${SECRETARY_NEUTRALITY_PROMPT}

You are updating a result draft with new discussion content.
        
Current draft summary: ${existingDraft?.summary || 'No summary yet.'}

Add any new key points or decisions from the latest messages. Keep the update concise.`,
      },
      {
        role: 'user',
        content: `New messages:\n${this.formatMessagesForSummary(newMessages, agents)}\n\nProvide a brief update to add to the existing summary:`,
      },
    ];

    this.agent.setStatus('thinking');

    try {
      const response = await llmRouter.complete(this.agent.llmProviderId, {
        model: this.agent.modelId,
        messages: prompt,
        temperature: 0.3,
        maxTokens: 500,
      });

      this.agent.setStatus('idle');

      // Append to existing content
      const newContent = existingDraft?.content
        ? `${existingDraft.content}\n\n---\n\n**Update:**\n${response.content}`
        : response.content;

      const draft = await resultDraftStorage.update(this.conversationId, {
        content: newContent,
      });

      eventBus.emit('draft:updated', draft);
      return draft;
    } catch (error) {
      this.agent.setStatus('idle');
      throw error;
    }
  }

  /**
   * Get the current result draft
   */
  async getResultDraft(): Promise<ResultDraft | undefined> {
    return resultDraftStorage.get(this.conversationId);
  }

  /**
   * Provide a quick status update on the discussion (legacy method)
   */
  async generateStatusUpdate(round: number): Promise<string> {
    const messages = await messageStorage.getByRound(this.conversationId, round);
    
    if (messages.length === 0) {
      return `Round ${round}: No messages yet.`;
    }

    const agents = await agentStorage.getByConversation(this.conversationId);

    const prompt: LLMMessage[] = [
      {
        role: 'system',
        content: `${SECRETARY_NEUTRALITY_PROMPT}

Provide a one-sentence summary of this round of discussion.`,
      },
      {
        role: 'user',
        content: this.formatMessagesForSummary(messages, agents),
      },
    ];

    try {
      const response = await llmRouter.complete(this.agent.llmProviderId, {
        model: this.agent.modelId,
        messages: prompt,
        temperature: 0.3,
        maxTokens: 100,
      });

      return `Round ${round}: ${response.content}`;
    } catch (error) {
      console.error('[Secretary] Failed to generate status update:', error);
      return `Round ${round}: ${messages.length} messages exchanged.`;
    }
  }

  /**
   * Update extracted themes in the draft
   */
  async updateThemes(themes: string[]): Promise<ResultDraft> {
    const draft = await resultDraftStorage.updateThemes(this.conversationId, themes);
    eventBus.emit('draft:updated', draft);
    return draft;
  }

  // ----- Context Distillation Methods -----

  /**
   * Distill older conversation messages into a compact summary
   * This replaces raw messages with a structured distillation that preserves context
   * while dramatically reducing token usage
   * 
   * @param upToRound - Distill messages up to and including this round (default: current round - 1)
   * @returns The updated distilled memory
   */
  async distillConversation(upToRound?: number): Promise<DistilledMemory> {
    const conversation = await conversationStorage.getById(this.conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    // Determine which round to distill up to (leave most recent round raw)
    const targetRound = upToRound ?? Math.max(0, conversation.currentRound - 1);
    
    // Get existing distillation
    const existingDistillation = await distilledMemoryStorage.getOrCreate(this.conversationId);
    
    // If we've already distilled up to this round, skip
    if (existingDistillation.lastDistilledRound >= targetRound) {
      console.log(`[Secretary] Already distilled up to round ${existingDistillation.lastDistilledRound}, skipping`);
      return existingDistillation;
    }

    // Get messages to distill (from last distilled message to target round)
    const allMessages = await messageStorage.getByConversation(this.conversationId);
    const agents = await agentStorage.getByConversation(this.conversationId);
    
    // Filter messages to distill:
    // - After the last distilled message
    // - Up to and including the target round
    // - Only response and interjection types (not system messages)
    const lastDistilledIdx = existingDistillation.lastDistilledMessageId
      ? allMessages.findIndex(m => m.id === existingDistillation.lastDistilledMessageId)
      : -1;
    
    const messagesToDistill = allMessages.filter((m, idx) => {
      if (idx <= lastDistilledIdx) return false;
      if (m.round > targetRound) return false;
      if (m.type !== 'response' && m.type !== 'interjection' && m.type !== 'opening') return false;
      return true;
    });

    if (messagesToDistill.length === 0) {
      console.log('[Secretary] No new messages to distill');
      return existingDistillation;
    }

    console.log(`[Secretary] Distilling ${messagesToDistill.length} messages from round ${existingDistillation.lastDistilledRound + 1} to ${targetRound}`);

    // Build distillation prompt
    const distillationPrompt = buildDistillationPrompt(
      messagesToDistill,
      agents,
      {
        distilledSummary: existingDistillation.distilledSummary || undefined,
        currentStance: existingDistillation.currentStance || undefined,
        keyDecisions: existingDistillation.keyDecisions?.length ? existingDistillation.keyDecisions : undefined,
        openQuestions: existingDistillation.openQuestions?.length ? existingDistillation.openQuestions : undefined,
        pinnedFacts: existingDistillation.pinnedFacts?.length ? existingDistillation.pinnedFacts : undefined,
      },
      conversation.subject,
      conversation.targetLanguage
    );

    this.agent.setStatus('thinking');

    try {
      const response = await llmRouter.complete(this.agent.llmProviderId, {
        model: this.agent.modelId,
        messages: distillationPrompt,
        temperature: 0.2, // Low temperature for accurate distillation
        maxTokens: 2000,
      });

      this.agent.setStatus('idle');

      // Parse the distillation response
      const distillation = parseDistillationResponse(response.content);
      
      if (!distillation) {
        console.error('[Secretary] Failed to parse distillation response');
        // IMPORTANT: Do NOT advance the distillation cursor on parse failure.
        // Otherwise we can permanently block distillation and let context grow unbounded.
        throw new Error('Failed to parse distillation response');
      }

      // Convert pinned facts to include IDs
      const pinnedFacts: PinnedFact[] = distillation.pinnedFacts.map((f, idx) => ({
        id: `pf-${targetRound}-${idx}`,
        content: f.content,
        category: f.category,
        source: f.source,
        round: targetRound,
        importance: f.importance,
      }));

      // Update distilled memory storage
      const updatedMemory = await distilledMemoryStorage.update(this.conversationId, {
        distilledSummary: distillation.distilledSummary,
        currentStance: distillation.currentStance,
        keyDecisions: distillation.keyDecisions,
        openQuestions: distillation.openQuestions,
        constraints: distillation.constraints,
        actionItems: distillation.actionItems,
        pinnedFacts,
        lastDistilledRound: targetRound,
        lastDistilledMessageId: messagesToDistill[messagesToDistill.length - 1].id,
        totalMessagesDistilled: existingDistillation.totalMessagesDistilled + messagesToDistill.length,
      });

      console.log(`[Secretary] Distillation complete. Distilled ${messagesToDistill.length} messages into ${distillation.distilledSummary.length} chars summary with ${pinnedFacts.length} pinned facts`);

      return updatedMemory;
    } catch (error) {
      this.agent.setStatus('idle');
      console.error('[Secretary] Failed to distill conversation:', error);
      throw error;
    }
  }

  /**
   * Check if context distillation is needed based on message count and round progress
   * Returns true if distillation should be triggered
   */
  async shouldDistill(): Promise<boolean> {
    const conversation = await conversationStorage.getById(this.conversationId);
    if (!conversation) return false;

    const existingDistillation = await distilledMemoryStorage.get(this.conversationId);
    
    // If we haven't distilled yet and we're past round 2, we should distill
    if (!existingDistillation && conversation.currentRound >= 2) {
      return true;
    }

    // If we're 2+ rounds ahead of last distillation, we should distill
    if (existingDistillation && conversation.currentRound > existingDistillation.lastDistilledRound + 1) {
      return true;
    }

    // Check message count in undistilled rounds
    const allMessages = await messageStorage.getByConversation(this.conversationId);
    const lastDistilledRound = existingDistillation?.lastDistilledRound ?? 0;
    const undistilledMessages = allMessages.filter(m => m.round > lastDistilledRound);
    
    // If we have more than 10 undistilled messages, consider distilling
    if (undistilledMessages.length > 10) {
      return true;
    }

    return false;
  }

  /**
   * Get the current distilled memory for this conversation
   */
  async getDistilledMemory(): Promise<DistilledMemory | undefined> {
    return distilledMemoryStorage.get(this.conversationId);
  }

  /**
   * Clear distilled memory (e.g., when resetting conversation)
   */
  async clearDistilledMemory(): Promise<void> {
    await distilledMemoryStorage.delete(this.conversationId);
  }

  // ----- Private Helper Methods -----

  private formatMessagesForSummary(
    messages: Message[],
    agents: Array<{ id: string; name: string }>
  ): string {
    return messages
      .map(m => {
        const sender = agents.find(a => a.id === m.agentId);
        const senderName = sender?.name || 'Unknown';
        return `[${senderName}]: ${m.content}`;
      })
      .join('\n\n');
  }

  // ----- Static Factory -----

  static async load(conversationId: string): Promise<SecretaryAgent | null> {
    const agents = await agentStorage.getByConversation(conversationId);
    const secretaryEntity = agents.find(a => a.isSecretary);
    
    if (!secretaryEntity) {
      return null;
    }

    const agent = new Agent(secretaryEntity);
    return new SecretaryAgent(agent);
  }
}

