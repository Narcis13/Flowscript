import { Node, NodeMetadata, SimpleEdgeMap } from '../../../core/types/node';
import { ExecutionContext } from '../../../core/types/context';
import { RegisterNode } from '../../registry';

interface XContentModeratorConfig {
    content: string;
    rules: Array<{
        type: string;
        threshold: number;
    }>;
}

@RegisterNode
export class XContentModeratorNode implements Node {
    metadata: NodeMetadata = {
        name: 'xContentModerator',
        description: 'Moderate content based on rules and policies',
        type: 'action',
        ai_hints: {
            purpose: 'Automated content moderation',
            when_to_use: 'Before posting content or when processing user-generated content',
            expected_edges: ['content_approved', 'content_flagged', 'content_blocked', 'error']
        }
    };

    async execute({ config, state }: ExecutionContext): Promise<SimpleEdgeMap> {
        const moderatorConfig = config as XContentModeratorConfig;

        if (!moderatorConfig?.content) {
            return {
                error: () => ({
                    error: 'Content is required',
                    details: 'Provide content to moderate'
                })
            };
        }

        if (!moderatorConfig.rules || moderatorConfig.rules.length === 0) {
            return {
                error: () => ({
                    error: 'Moderation rules required',
                    details: 'Provide at least one moderation rule'
                })
            };
        }

        try {
            const moderationResults = [];
            let overallSeverity = 0;
            let shouldBlock = false;
            let shouldFlag = false;

            // Apply each moderation rule
            for (const rule of moderatorConfig.rules) {
                const result = this.applyRule(moderatorConfig.content, rule);
                moderationResults.push(result);

                if (result.score >= rule.threshold) {
                    if (rule.threshold >= 0.8) {
                        shouldBlock = true;
                    } else if (rule.threshold >= 0.5) {
                        shouldFlag = true;
                    }
                    overallSeverity = Math.max(overallSeverity, result.score);
                }
            }

            const moderationReport = {
                content: moderatorConfig.content.substring(0, 100) + (moderatorConfig.content.length > 100 ? '...' : ''),
                contentLength: moderatorConfig.content.length,
                results: moderationResults,
                overallSeverity,
                moderatedAt: new Date().toISOString()
            };

            state.set('lastModerationReport', moderationReport);

            if (shouldBlock) {
                return {
                    content_blocked: () => ({
                        ...moderationReport,
                        reason: 'Content violates platform policies',
                        action: 'blocked',
                        violations: moderationResults.filter(r => r.score >= 0.8)
                    })
                };
            }

            if (shouldFlag) {
                return {
                    content_flagged: () => ({
                        ...moderationReport,
                        reason: 'Content requires review',
                        action: 'flagged',
                        warnings: moderationResults.filter(r => r.score >= 0.5 && r.score < 0.8)
                    })
                };
            }

            return {
                content_approved: () => ({
                    ...moderationReport,
                    action: 'approved',
                    message: 'Content passed all moderation rules'
                })
            };

        } catch (error) {
            console.error('Error in xContentModerator:', error);
            return {
                error: () => ({
                    error: 'Content moderation failed',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }

    private applyRule(content: string, rule: { type: string; threshold: number }): any {
        const lowerContent = content.toLowerCase();

        switch (rule.type) {
            case 'spam':
                return this.checkSpam(content, lowerContent);
            
            case 'toxicity':
                return this.checkToxicity(content, lowerContent);
            
            case 'adult_content':
                return this.checkAdultContent(content, lowerContent);
            
            case 'violence':
                return this.checkViolence(content, lowerContent);
            
            case 'hate_speech':
                return this.checkHateSpeech(content, lowerContent);
            
            case 'misinformation':
                return this.checkMisinformation(content, lowerContent);
            
            case 'personal_info':
                return this.checkPersonalInfo(content);
            
            default:
                return {
                    ruleType: rule.type,
                    score: 0,
                    confidence: 0,
                    details: 'Unknown rule type'
                };
        }
    }

    private checkSpam(content: string, lowerContent: string): any {
        let score = 0;
        const details = [];

        // Check for excessive links
        const linkCount = (content.match(/https?:\/\//g) || []).length;
        if (linkCount > 3) {
            score += 0.3;
            details.push(`Excessive links: ${linkCount}`);
        }

        // Check for repetitive content
        const words = lowerContent.split(/\s+/);
        const uniqueWords = new Set(words);
        const repetitionRatio = 1 - (uniqueWords.size / words.length);
        if (repetitionRatio > 0.5) {
            score += 0.3;
            details.push(`High repetition: ${Math.round(repetitionRatio * 100)}%`);
        }

        // Check for spam keywords
        const spamKeywords = ['buy now', 'click here', 'limited offer', 'act now', 'free money'];
        const spamCount = spamKeywords.filter(keyword => lowerContent.includes(keyword)).length;
        if (spamCount > 0) {
            score += spamCount * 0.2;
            details.push(`Spam keywords found: ${spamCount}`);
        }

        // Check for excessive caps
        const capsRatio = (content.match(/[A-Z]/g) || []).length / content.length;
        if (capsRatio > 0.3) {
            score += 0.2;
            details.push(`Excessive caps: ${Math.round(capsRatio * 100)}%`);
        }

        return {
            ruleType: 'spam',
            score: Math.min(1, score),
            confidence: 0.8,
            details: details.join(', ')
        };
    }

    private checkToxicity(content: string, lowerContent: string): any {
        // Simplified toxicity check - in production, use a proper toxicity detection API
        const toxicPatterns = ['hate', 'stupid', 'idiot', 'moron', 'dumb'];
        const matches = toxicPatterns.filter(pattern => lowerContent.includes(pattern));
        
        return {
            ruleType: 'toxicity',
            score: Math.min(1, matches.length * 0.3),
            confidence: 0.7,
            details: matches.length > 0 ? `Found toxic patterns: ${matches.join(', ')}` : 'No toxic content detected'
        };
    }

    private checkAdultContent(content: string, lowerContent: string): any {
        // Simplified adult content check
        const adultPatterns = ['nsfw', 'adult', 'explicit'];
        const matches = adultPatterns.filter(pattern => lowerContent.includes(pattern));
        
        return {
            ruleType: 'adult_content',
            score: matches.length > 0 ? 0.8 : 0,
            confidence: 0.6,
            details: matches.length > 0 ? 'Potential adult content indicators' : 'No adult content detected'
        };
    }

    private checkViolence(content: string, lowerContent: string): any {
        const violencePatterns = ['kill', 'hurt', 'attack', 'violence', 'threat'];
        const matches = violencePatterns.filter(pattern => lowerContent.includes(pattern));
        
        return {
            ruleType: 'violence',
            score: Math.min(1, matches.length * 0.4),
            confidence: 0.7,
            details: matches.length > 0 ? `Violence indicators: ${matches.join(', ')}` : 'No violence detected'
        };
    }

    private checkHateSpeech(content: string, lowerContent: string): any {
        // Very simplified - in production, use proper hate speech detection
        const hatePatterns = ['hate', 'discriminate'];
        const matches = hatePatterns.filter(pattern => lowerContent.includes(pattern));
        
        return {
            ruleType: 'hate_speech',
            score: matches.length > 0 ? 0.7 : 0,
            confidence: 0.6,
            details: matches.length > 0 ? 'Potential hate speech indicators' : 'No hate speech detected'
        };
    }

    private checkMisinformation(content: string, lowerContent: string): any {
        // Very simplified - in production, use fact-checking APIs
        const misinfoPhrases = ['fake news', 'conspiracy', 'hoax'];
        const matches = misinfoPhrases.filter(phrase => lowerContent.includes(phrase));
        
        return {
            ruleType: 'misinformation',
            score: matches.length > 0 ? 0.5 : 0,
            confidence: 0.5,
            details: matches.length > 0 ? 'Potential misinformation indicators' : 'No misinformation indicators'
        };
    }

    private checkPersonalInfo(content: string): any {
        const patterns = {
            email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
            phone: /(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
            ssn: /\d{3}-\d{2}-\d{4}/g,
            creditCard: /\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}/g
        };

        const found = [];
        for (const [type, pattern] of Object.entries(patterns)) {
            if (pattern.test(content)) {
                found.push(type);
            }
        }

        return {
            ruleType: 'personal_info',
            score: found.length > 0 ? 0.9 : 0,
            confidence: 0.9,
            details: found.length > 0 ? `Found: ${found.join(', ')}` : 'No personal information detected'
        };
    }
}

export const xContentModerator = new XContentModeratorNode();