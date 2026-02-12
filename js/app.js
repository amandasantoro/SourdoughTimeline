/**
 * Sourdough Timeline - Main Application
 * A sourdough bread baking tracker with timers and logging
 */

class SourdoughTimeline {
    constructor() {
        this.stages = [];
        this.sections = [];
        this.flattenedStages = [];
        this.ingredients = [];
        this.colorGroups = {};
        
        this.currentStageIndex = 0;
        this.viewingStageIndex = null; // For viewing past stages
        this.isViewingPast = false;
        this.recipeMultiplier = 1;
        this.bakeLog = {
            recipeName: null,
            starterFedTime: null,
            recipeMultiplier: 1,
            startTime: null,
            endTime: null,
            ingredients: {},
            stages: []
        };
        
        this.timer = null;
        this.timerEndTime = null;
        this.timerDuration = 0;
        
        // Helper timer (for mixing stages)
        this.helperTimerInterval = null;
        this.helperTimerDuration = 0;
        this.helperTimerRemaining = 0;
        
        this.init();
    }
    
    // State persistence methods
    saveState() {
        const state = {
            currentRecipeId: this.currentRecipeId,
            currentStageIndex: this.currentStageIndex,
            recipeMultiplier: this.recipeMultiplier,
            bakeLog: this.bakeLog,
            timerEndTime: this.timerEndTime,
            timerDuration: this.timerDuration
        };
        localStorage.setItem('sourdoughTimeline_state', JSON.stringify(state));
    }
    
    loadState() {
        const saved = localStorage.getItem('sourdoughTimeline_state');
        if (!saved) return null;
        
        try {
            const state = JSON.parse(saved);
            // Convert date strings back to Date objects
            if (state.bakeLog) {
                if (state.bakeLog.starterFedTime) {
                    state.bakeLog.starterFedTime = new Date(state.bakeLog.starterFedTime);
                }
                if (state.bakeLog.startTime) {
                    state.bakeLog.startTime = new Date(state.bakeLog.startTime);
                }
                if (state.bakeLog.endTime) {
                    state.bakeLog.endTime = new Date(state.bakeLog.endTime);
                }
                if (state.bakeLog.stages) {
                    state.bakeLog.stages.forEach(stage => {
                        if (stage.startTime) stage.startTime = new Date(stage.startTime);
                        if (stage.endTime) stage.endTime = new Date(stage.endTime);
                        if (stage.timerStarted) stage.timerStarted = new Date(stage.timerStarted);
                    });
                }
            }
            return state;
        } catch (error) {
            console.error('Failed to parse saved state:', error);
            return null;
        }
    }
    
    clearState() {
        localStorage.removeItem('sourdoughTimeline_state');
    }
    
    async restoreState(state) {
        // Load the recipe that was in progress
        if (state.currentRecipeId && state.currentRecipeId !== this.currentRecipeId) {
            await this.loadRecipe(state.currentRecipeId);
        }
        
        this.currentStageIndex = state.currentStageIndex;
        this.recipeMultiplier = state.recipeMultiplier;
        this.bakeLog = state.bakeLog;
        this.timerEndTime = state.timerEndTime;
        this.timerDuration = state.timerDuration;
        
        // Check if we were in the middle of a timer
        if (this.timerEndTime && this.timerEndTime > Date.now()) {
            // Resume timer
            this.showScreen('timer-screen');
            this.renderTimeline();
            this.updateTimerDisplay();
            this.timer = setInterval(() => this.updateTimerDisplay(), 1000);
            
            // Update next stage label
            const nextStage = this.flattenedStages[this.currentStageIndex + 1];
            document.getElementById('next-stage-label').textContent = 
                nextStage ? `Next: ${nextStage.name}` : 'Final stage!';
        } else if (this.timerEndTime && this.timerEndTime <= Date.now()) {
            // Timer expired while away - show alert
            this.showScreen('timer-screen');
            this.renderTimeline();
            document.getElementById('timer-hours').textContent = '00';
            document.getElementById('timer-minutes').textContent = '00';
            document.getElementById('timer-seconds').textContent = '00';
            document.getElementById('timer-progress').style.width = '100%';
            document.getElementById('timer-note').textContent = 'Timer complete! Ready for next stage.';
            document.getElementById('timer-note').classList.add('complete');
            
            const nextStage = this.flattenedStages[this.currentStageIndex + 1];
            document.getElementById('next-stage-label').textContent = 
                nextStage ? `Next: ${nextStage.name}` : 'Final stage!';
            this.showAlert();
        } else {
            // Resume at current stage
            this.showStage();
        }
    }
    
    async init() {
        try {
            await this.loadRecipeIndex();
            await this.loadRecipe(this.recipeIndex.defaultRecipe);
            this.setupEventListeners();
            this.renderRecipeSelector();
            
            // Check for saved state
            const savedState = this.loadState();
            if (savedState && savedState.bakeLog && savedState.bakeLog.startTime && !savedState.bakeLog.endTime) {
                // Restore in-progress bake
                await this.restoreState(savedState);
            } else {
                this.renderTimeline();
            }
        } catch (error) {
            console.error('Failed to initialize app:', error);
            alert('Failed to load configuration. Please check the console for details.');
        }
    }
    
    async loadRecipeIndex() {
        const response = await fetch('recipes/index.json');
        this.recipeIndex = await response.json();
    }
    
    async loadRecipe(recipeId) {
        const recipeInfo = this.recipeIndex.recipes.find(r => r.id === recipeId);
        if (!recipeInfo) {
            throw new Error(`Recipe not found: ${recipeId}`);
        }
        
        const response = await fetch(`recipes/${recipeInfo.file}`);
        const recipeData = await response.json();
        
        this.currentRecipeId = recipeId;
        this.currentRecipeName = recipeData.name;
        this.stages = recipeData.stages;
        this.sections = recipeData.sections || [];
        this.colorGroups = recipeData.colorGroups;
        this.ingredients = recipeData.ingredients;
        
        // Flatten stages (including sub-stages)
        this.flattenedStages = this.flattenStages(this.stages);
    }
    
    renderRecipeSelector() {
        const select = document.getElementById('recipe-select');
        select.innerHTML = '';
        
        for (const recipe of this.recipeIndex.recipes) {
            const option = document.createElement('option');
            option.value = recipe.id;
            option.textContent = recipe.name;
            if (recipe.id === this.currentRecipeId) {
                option.selected = true;
            }
            select.appendChild(option);
        }
    }
    
    async onRecipeChange(recipeId) {
        await this.loadRecipe(recipeId);
        this.renderTimeline();
    }
    
    flattenStages(stages, parentColorGroup = null) {
        const result = [];
        let stageNumber = 1;
        
        for (const stage of stages) {
            if (stage.subStages && stage.subStages.length > 0) {
                // Add sub-stages with parent's color group
                let subNumber = 1;
                for (const subStage of stage.subStages) {
                    result.push({
                        ...subStage,
                        colorGroup: stage.colorGroup,
                        displayNumber: `${stageNumber}.${subNumber}`,
                        parentName: stage.name
                    });
                    subNumber++;
                }
            } else {
                result.push({
                    ...stage,
                    displayNumber: String(stageNumber)
                });
            }
            stageNumber++;
        }
        
        return result;
    }
    
    setupEventListeners() {
        // Recipe selector
        document.getElementById('recipe-select').addEventListener('change', (e) => {
            this.onRecipeChange(e.target.value);
        });
        
        // Start bake button
        document.getElementById('start-bake-btn').addEventListener('click', () => {
            this.startBake();
        });
        
        // Skip stage button
        document.getElementById('skip-stage-btn').addEventListener('click', () => {
            this.skipStage();
        });
        
        // Complete stage button
        document.getElementById('complete-stage-btn').addEventListener('click', () => {
            this.completeStage();
        });
        
        // Continue to next stage button (on timer screen)
        document.getElementById('continue-btn').addEventListener('click', () => {
            this.continueToNextStage();
        });
        
        // Starter ready button (on starter timer screen)
        document.getElementById('starter-ready-btn').addEventListener('click', () => {
            this.continueFromStarterTimer();
        });
        
        // Back to current stage button
        document.getElementById('back-to-current-btn').addEventListener('click', () => {
            this.backToCurrentStage();
        });
        
        // Skip to stage button (for future stages)
        document.getElementById('skip-to-stage-btn').addEventListener('click', () => {
            this.skipToStage();
        });
        
        // Dismiss alert button
        document.getElementById('dismiss-alert-btn').addEventListener('click', () => {
            this.dismissAlert();
        });
        
        // Copy summary button
        document.getElementById('copy-summary-btn').addEventListener('click', () => {
            this.copySummary();
        });
        
        // New bake button
        document.getElementById('new-bake-btn').addEventListener('click', () => {
            this.resetBake();
        });
        
        // Home button
        document.getElementById('home-btn').addEventListener('click', () => {
            this.goHome();
        });
    }
    
    renderTimeline() {
        const timeline = document.getElementById('timeline');
        timeline.innerHTML = '';
        
        // Determine which section contains the current stage
        const currentStage = this.flattenedStages[this.currentStageIndex];
        const currentStageId = currentStage ? currentStage.id : null;
        
        // Helper to get all stage IDs in a section (including subsections)
        const getAllSectionStageIds = (section) => {
            let ids = [...section.stageIds];
            if (section.subSections) {
                for (const sub of section.subSections) {
                    ids = ids.concat(sub.stageIds);
                }
            }
            return ids;
        };
        
        // Get all stages for a section (in order)
        const getAllSectionStages = (section) => {
            let stages = [];
            // Add main stages first
            for (const id of section.stageIds) {
                const stage = this.flattenedStages.find(s => s.id === id);
                if (stage) stages.push(stage);
            }
            // Add subsection stages
            if (section.subSections) {
                for (const sub of section.subSections) {
                    for (const id of sub.stageIds) {
                        const stage = this.flattenedStages.find(s => s.id === id);
                        if (stage) stages.push(stage);
                    }
                }
            }
            return stages;
        };
        
        // Find current section index (only if bake has started)
        let currentSectionIndex = -1;
        const bakeHasStarted = this.bakeLog.startTime !== null;
        
        if (bakeHasStarted) {
            for (let i = 0; i < this.sections.length; i++) {
                const allIds = getAllSectionStageIds(this.sections[i]);
                if (allIds.includes(currentStageId)) {
                    currentSectionIndex = i;
                    break;
                }
            }
        }
        
        // Render each section
        this.sections.forEach((section, sectionIdx) => {
            const allSectionStageIds = getAllSectionStageIds(section);
            const allSectionStages = getAllSectionStages(section);
            const isActive = bakeHasStarted && sectionIdx === currentSectionIndex;
            const isCompleted = this.isSectionCompleted(allSectionStageIds);
            const isFuture = bakeHasStarted && sectionIdx > currentSectionIndex && currentSectionIndex >= 0;
            
            // Add line before section (except first)
            if (sectionIdx > 0) {
                const line = document.createElement('div');
                line.className = 'timeline-line';
                if (isCompleted || isActive) {
                    line.classList.add('completed');
                }
                timeline.appendChild(line);
            }
            
            if (isActive && allSectionStages.length > 0) {
                // EXPANDED: Show all stages in this section
                const expandedSection = document.createElement('div');
                expandedSection.className = 'timeline-expanded-section';
                
                allSectionStages.forEach((stage, stageIdx) => {
                    const globalIndex = this.flattenedStages.findIndex(s => s.id === stage.id);
                    const stageLog = this.bakeLog.stages.find(s => s.id === stage.id);
                    const stageCompleted = globalIndex < this.currentStageIndex;
                    const stageCurrent = globalIndex === this.currentStageIndex;
                    const stageSkipped = stageLog && stageLog.skipped;
                    
                    // Add connector line between stages (except before first)
                    if (stageIdx > 0) {
                        const stageLine = document.createElement('div');
                        stageLine.className = 'timeline-stage-line';
                        if (stageCompleted || stageCurrent) {
                            stageLine.classList.add('completed');
                        }
                        expandedSection.appendChild(stageLine);
                    }
                    
                    // Stage container
                    const stageEl = document.createElement('div');
                    stageEl.className = 'timeline-stage';
                    if (stageCurrent) stageEl.classList.add('current');
                    
                    // Stage dot
                    const dot = document.createElement('div');
                    dot.className = 'timeline-stage-dot';
                    dot.setAttribute('data-index', globalIndex);
                    
                    if (stageCompleted) {
                        if (stageSkipped) {
                            dot.classList.add('skipped');
                        } else {
                            dot.classList.add('completed');
                        }
                    } else if (stageCurrent) {
                        dot.classList.add('current');
                    }
                    
                    // Make all stages clickable to jump (except current and skipped)
                    if (!stageCurrent && !stageSkipped) {
                        dot.classList.add('clickable');
                        stageEl.classList.add('clickable');
                        stageEl.addEventListener('click', async (e) => {
                            e.stopPropagation();
                            try {
                                await this.showStage(globalIndex, true);
                            } catch (error) {
                                console.error('Error navigating to stage:', error);
                            }
                        });
                    }
                    
                    stageEl.appendChild(dot);
                    
                    // Stage label
                    const label = document.createElement('div');
                    label.className = 'timeline-stage-label';
                    label.textContent = stage.shortName;
                    stageEl.appendChild(label);
                    
                    expandedSection.appendChild(stageEl);
                });
                
                timeline.appendChild(expandedSection);
                
            } else {
                // COLLAPSED: Show as single node with hover-expandable stages
                const nodeWrapper = document.createElement('div');
                nodeWrapper.className = 'timeline-node-wrapper';
                nodeWrapper.setAttribute('data-section-id', section.id);
                
                if (isCompleted) nodeWrapper.classList.add('completed');
                if (isFuture) nodeWrapper.classList.add('future');
                
                // Main node (visible by default)
                const node = document.createElement('div');
                node.className = 'timeline-node';
                
                // Node dot
                const dot = document.createElement('div');
                dot.className = 'timeline-node-dot';
                node.appendChild(dot);
                
                // Node label
                const label = document.createElement('div');
                label.className = 'timeline-node-label';
                label.textContent = section.name;
                node.appendChild(label);
                
                // Make section node clickable to jump to first stage
                if (allSectionStages.length > 0) {
                    const firstStageIndex = this.flattenedStages.findIndex(s => s.id === allSectionStages[0].id);
                    node.classList.add('clickable');
                    node.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        try {
                            await this.showStage(firstStageIndex, true);
                        } catch (error) {
                            console.error('Error navigating to stage:', error);
                        }
                    });
                }
                
                nodeWrapper.appendChild(node);
                
                // Expandable stages container (hidden by default, shown on hover)
                if (allSectionStages.length > 0) {
                    const expandedStages = document.createElement('div');
                    expandedStages.className = 'timeline-hover-stages';
                    
                    allSectionStages.forEach((stage, stageIdx) => {
                        const globalIndex = this.flattenedStages.findIndex(s => s.id === stage.id);
                        const stageLog = this.bakeLog.stages.find(s => s.id === stage.id);
                        const stageCompleted = globalIndex < this.currentStageIndex;
                        const stageSkipped = stageLog && stageLog.skipped;
                        
                        // Add connector line between stages (except before first)
                        if (stageIdx > 0) {
                            const stageLine = document.createElement('div');
                            stageLine.className = 'timeline-stage-line';
                            if (stageCompleted) {
                                stageLine.classList.add('completed');
                            }
                            expandedStages.appendChild(stageLine);
                        }
                        
                        // Stage container
                        const stageEl = document.createElement('div');
                        stageEl.className = 'timeline-stage';
                        
                        // Stage dot
                        const stageDot = document.createElement('div');
                        stageDot.className = 'timeline-stage-dot';
                        stageDot.setAttribute('data-index', globalIndex);
                        
                        if (stageCompleted) {
                            if (stageSkipped) {
                                stageDot.classList.add('skipped');
                            } else {
                                stageDot.classList.add('completed');
                            }
                        }
                        
                        // Make all stages clickable to jump
                        if (!stageSkipped) {
                            stageDot.classList.add('clickable');
                            stageEl.classList.add('clickable');
                            stageEl.addEventListener('click', async (e) => {
                                e.stopPropagation();
                                try {
                                    await this.showStage(globalIndex, true);
                                } catch (error) {
                                    console.error('Error navigating to stage:', error);
                                }
                            });
                        }
                        
                        stageEl.appendChild(stageDot);
                        
                        // Stage label
                        const stageLabel = document.createElement('div');
                        stageLabel.className = 'timeline-stage-label';
                        stageLabel.textContent = stage.shortName;
                        stageEl.appendChild(stageLabel);
                        
                        expandedStages.appendChild(stageEl);
                    });
                    
                    nodeWrapper.appendChild(expandedStages);
                }
                
                timeline.appendChild(nodeWrapper);
            }
        });
    }
    
    // Legacy function - kept for compatibility but not used with new timeline
    renderStageSteps(container, stages) {
        stages.forEach((stage, idx) => {
            const globalIndex = this.flattenedStages.findIndex(s => s.id === stage.id);
            
            // Add connector (except before first)
            if (idx > 0) {
                const connector = document.createElement('div');
                connector.className = 'timeline-connector';
                if (globalIndex <= this.currentStageIndex) {
                    connector.classList.add('completed');
                }
                container.appendChild(connector);
            }
            
            // Add step
            const step = document.createElement('div');
            step.className = 'timeline-step';
            step.setAttribute('data-color-group', stage.colorGroup);
            step.setAttribute('data-index', globalIndex);
            
            const stageLog = this.bakeLog.stages.find(s => s.id === stage.id);
            const isCompleted = globalIndex < this.currentStageIndex;
            const isCurrent = globalIndex === this.currentStageIndex;
            const isSkipped = stageLog && stageLog.skipped;
            
            if (isCompleted) {
                if (isSkipped) {
                    step.classList.add('skipped');
                } else {
                    step.classList.add('completed');
                    step.classList.add('clickable');
                }
            } else if (isCurrent) {
                step.classList.add('current');
            }
            
            step.innerHTML = `
                <span class="step-number">${isSkipped ? '—' : (isCompleted ? '' : stage.displayNumber)}</span>
                <span class="step-name">${stage.shortName}</span>
            `;
            
            // Add click handler for completed stages
            if (isCompleted && !isSkipped) {
                step.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.viewPastStage(globalIndex);
                });
            }
            
            container.appendChild(step);
        });
    }
    
    isSectionCompleted(stageIds) {
        for (const id of stageIds) {
            const idx = this.flattenedStages.findIndex(s => s.id === id);
            if (idx >= this.currentStageIndex) return false;
        }
        return stageIds.length > 0 && this.bakeLog.startTime !== null;
    }
    
    hasSectionStarted(stageIds) {
        if (!this.bakeLog.startTime) return false;
        const firstIdx = this.flattenedStages.findIndex(s => stageIds.includes(s.id));
        return firstIdx <= this.currentStageIndex;
    }
    
    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenId).classList.add('active');
    }
    
    startBake() {
        // Get the starter fed time from input
        const timeInput = document.getElementById('starter-fed-time');
        let starterFedTime;
        
        if (timeInput.value) {
            // Parse the time input and create a Date for today with that time
            const [hours, minutes] = timeInput.value.split(':').map(Number);
            starterFedTime = new Date();
            starterFedTime.setHours(hours, minutes, 0, 0);
            
            // If the time is in the future, assume it was yesterday
            if (starterFedTime > new Date()) {
                starterFedTime.setDate(starterFedTime.getDate() - 1);
            }
        } else {
            // Default to current time
            starterFedTime = new Date();
        }
        
        // Get the recipe multiplier
        const multiplierInput = document.getElementById('recipe-multiplier');
        this.recipeMultiplier = parseFloat(multiplierInput.value) || 1;
        
        this.bakeLog = {
            recipeName: this.currentRecipeName,
            starterFedTime: starterFedTime,
            recipeMultiplier: this.recipeMultiplier,
            startTime: new Date(),
            endTime: null,
            ingredients: {},
            stages: [],
            starterExtraTime: 0
        };
        this.currentStageIndex = 0;
        this.timerEndTime = null;
        this.timerDuration = 0;
        
        // Check time since starter was fed (target: 2 hours = 120 minutes)
        const targetWaitMs = 2 * 60 * 60 * 1000; // 2 hours in ms
        const timeSinceFed = Date.now() - starterFedTime.getTime();
        const earlyTolerance = 60 * 1000; // 1 minute tolerance before 2 hours
        const lateTolerance = 10 * 60 * 1000; // 10 minutes tolerance after 2 hours
        
        if (timeSinceFed >= targetWaitMs - earlyTolerance && timeSinceFed <= targetWaitMs + lateTolerance) {
            // Within 1 minute before or 10 minutes after 2 hours - go straight to autolyse
            this.saveState();
            this.renderTimeline();
            this.showStage();
        } else if (timeSinceFed < targetWaitMs - earlyTolerance) {
            // Less than 2 hours (minus tolerance) - show starter wait timer
            this.saveState();
            this.renderTimeline();
            this.startStarterTimer(targetWaitMs - timeSinceFed);
        } else {
            // More than 2 hours + 10 minutes - show warning and proceed
            const extraTimeMs = timeSinceFed - targetWaitMs;
            this.bakeLog.starterExtraTime = extraTimeMs;
            this.saveState();
            this.renderTimeline();
            this.showStageWithStarterWarning(extraTimeMs);
        }
    }
    
    startStarterTimer(remainingMs) {
        this.starterTimerEndTime = Date.now() + remainingMs;
        this.starterTimerDuration = remainingMs;
        
        this.showScreen('starter-timer-screen');
        
        // Start timer interval
        this.updateStarterTimerDisplay();
        this.starterTimer = setInterval(() => this.updateStarterTimerDisplay(), 1000);
    }
    
    updateStarterTimerDisplay() {
        const remaining = Math.max(0, this.starterTimerEndTime - Date.now());
        
        const hours = Math.floor(remaining / (1000 * 60 * 60));
        const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
        
        document.getElementById('starter-timer-hours').textContent = String(hours).padStart(2, '0');
        document.getElementById('starter-timer-minutes').textContent = String(minutes).padStart(2, '0');
        document.getElementById('starter-timer-seconds').textContent = String(seconds).padStart(2, '0');
        
        // Update progress bar
        const elapsed = this.starterTimerDuration - remaining;
        const progress = (elapsed / this.starterTimerDuration) * 100;
        document.getElementById('starter-timer-progress').style.width = `${progress}%`;
        
        // Timer complete
        if (remaining <= 0) {
            clearInterval(this.starterTimer);
            this.starterTimer = null;
            document.getElementById('starter-timer-note').textContent = 'Starter is ready! Begin your autolyse.';
            document.getElementById('starter-timer-note').classList.add('complete');
            this.playNotificationSound();
        }
    }
    
    continueFromStarterTimer() {
        if (this.starterTimer) {
            clearInterval(this.starterTimer);
            this.starterTimer = null;
        }
        this.showStage();
    }
    
    async showStageWithStarterWarning(extraTimeMs) {
        // Show the first stage with a warning banner
        await this.showStage();
        
        // Add warning message to the stage card
        const stageCard = document.getElementById('stage-card');
        let warningBanner = document.getElementById('starter-warning-banner');
        
        if (!warningBanner) {
            warningBanner = document.createElement('div');
            warningBanner.id = 'starter-warning-banner';
            warningBanner.className = 'starter-warning-banner';
            stageCard.insertBefore(warningBanner, stageCard.firstChild);
        }
        
        const extraMins = Math.round(extraTimeMs / (60 * 1000));
        const extraHours = Math.floor(extraMins / 60);
        const remainingMins = extraMins % 60;
        
        let extraTimeStr = '';
        if (extraHours > 0) {
            extraTimeStr = `${extraHours}h ${remainingMins}m`;
        } else {
            extraTimeStr = `${remainingMins} minutes`;
        }
        
        warningBanner.innerHTML = `
            <strong>⚠️ Starter had extra rest time</strong>
            <p>Your starter rested ${extraTimeStr} longer than the target 2 hours. 
            Consider that this starter may be weaker than expected going into the autolyse, so the ferment time may vary.</p>
        `;
        warningBanner.style.display = 'block';
    }
    
    async showStage(stageIndex = null, viewingPast = false) {
        const indexToShow = stageIndex !== null ? stageIndex : this.currentStageIndex;
        const stage = this.flattenedStages[indexToShow];
        
        if (!stage) {
            this.showSummary();
            return;
        }
        
        this.isViewingPast = viewingPast;
        this.viewingStageIndex = viewingPast ? indexToShow : null;
        
        // Check if this stage is actually completed
        const isCompleted = indexToShow < this.currentStageIndex;
        
        // Update stage card
        const stageCard = document.getElementById('stage-card');
        stageCard.setAttribute('data-color-group', stage.colorGroup);
        
        // Toggle viewing past mode styling - only show "Completed" badge if actually completed
        const viewingBadge = document.getElementById('viewing-badge');
        if (viewingPast && isCompleted) {
            stageCard.classList.add('viewing-past');
            viewingBadge.style.display = 'inline-block';
        } else {
            stageCard.classList.remove('viewing-past');
            viewingBadge.style.display = 'none';
        }
        
        // Hide starter warning banner if not on first stage or if viewing past
        const warningBanner = document.getElementById('starter-warning-banner');
        if (warningBanner) {
            if (indexToShow === 0 && !viewingPast && this.bakeLog.starterExtraTime > 0) {
                // Show banner only on first stage with extra time
                warningBanner.style.display = 'block';
            } else {
                warningBanner.style.display = 'none';
            }
        }
        
        document.getElementById('stage-number').textContent = stage.displayNumber;
        document.getElementById('stage-name').textContent = stage.name;
        
        // Show/hide past stage info
        const pastStageInfo = document.getElementById('past-stage-info');
        if (viewingPast) {
            const stageLog = this.bakeLog.stages.find(s => s.id === stage.id);
            if (stageLog && stageLog.duration) {
                document.getElementById('past-stage-duration').textContent = this.formatDuration(stageLog.duration);
                pastStageInfo.style.display = 'block';
            } else {
                pastStageInfo.style.display = 'none';
            }
        } else {
            pastStageInfo.style.display = 'none';
        }
        
        // Load and render markdown instructions
        try {
            const response = await fetch(`instructions/${stage.instructionsFile}`);
            const markdown = await response.text();
            
            // Split tips from main content
            const tipsBox = document.getElementById('tips-box');
            const tipsContent = document.getElementById('tips-content');
            
            // Check for ## Tips section (case-insensitive)
            const tipsMatch = markdown.match(/\n## Tips\s*\n([\s\S]*?)(?=\n## |$)/i);
            
            if (tipsMatch) {
                // Remove tips from main markdown and render separately
                const mainMarkdown = markdown.replace(/\n## Tips\s*\n[\s\S]*?(?=\n## |$)/i, '');
                document.getElementById('stage-instructions').innerHTML = marked.parse(mainMarkdown);
                tipsContent.innerHTML = marked.parse(tipsMatch[1].trim());
                tipsBox.style.display = 'block';
            } else {
                document.getElementById('stage-instructions').innerHTML = marked.parse(markdown);
                tipsBox.style.display = 'none';
            }
        } catch (error) {
            console.error('Failed to load instructions:', error);
            document.getElementById('stage-instructions').innerHTML = '<p>Instructions not available.</p>';
            document.getElementById('tips-box').style.display = 'none';
        }
        
        // Show/hide appropriate buttons and inputs
        const skipBtn = document.getElementById('skip-stage-btn');
        const completeBtn = document.getElementById('complete-stage-btn');
        const backBtn = document.getElementById('back-to-current-btn');
        const skipToBtn = document.getElementById('skip-to-stage-btn');
        const ingredientSection = document.getElementById('ingredient-section');
        const stageActions = document.getElementById('stage-actions');
        
        // Check if this is a future stage (not completed, not current)
        const isFutureStage = indexToShow > this.currentStageIndex;
        
        if (viewingPast) {
            // Viewing non-current stage - show back button
            skipBtn.style.display = 'none';
            completeBtn.style.display = 'none';
            backBtn.style.display = 'block';
            ingredientSection.style.display = 'none';
            document.getElementById('helper-timer-box').style.display = 'none';
            stageActions.classList.add('viewing-mode');
            
            // Show skip-to button only for future stages
            if (isFutureStage) {
                skipToBtn.style.display = 'block';
                skipToBtn.setAttribute('data-target-index', indexToShow);
            } else {
                skipToBtn.style.display = 'none';
            }
        } else {
            // Current stage - show normal buttons
            skipBtn.style.display = 'block';
            completeBtn.style.display = 'block';
            backBtn.style.display = 'none';
            skipToBtn.style.display = 'none';
            stageActions.classList.remove('viewing-mode');
            
            // Show ingredient input if this stage has specific ingredients
            if (stage.ingredientInputs && stage.ingredientInputs.length > 0) {
                this.renderIngredientInputs(stage.ingredientInputs);
                ingredientSection.style.display = 'block';
            } else {
                ingredientSection.style.display = 'none';
            }
            
            // Show helper timer if this stage has one
            const helperTimerBox = document.getElementById('helper-timer-box');
            if (stage.helperTimerMinutes) {
                this.setupHelperTimer(stage.helperTimerMinutes);
                helperTimerBox.style.display = 'block';
            } else {
                helperTimerBox.style.display = 'none';
            }
            
            // Update button text based on stage duration
            if (stage.durationMinutes > 0) {
                completeBtn.textContent = 'Complete & Start Timer';
            } else {
                completeBtn.textContent = 'Complete Stage';
            }
        }
        
        this.showScreen('stage-screen');
        this.renderTimeline();
    }
    
    setupHelperTimer(minutes) {
        this.helperTimerDuration = minutes * 60;
        this.helperTimerRemaining = this.helperTimerDuration;
        this.helperTimerInterval = null;
        
        const display = document.getElementById('helper-timer-display');
        const btn = document.getElementById('helper-timer-btn');
        
        display.textContent = this.formatHelperTime(this.helperTimerRemaining);
        display.className = 'helper-timer-display';
        btn.textContent = 'Start';
        
        // Remove old listener and add new one
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener('click', () => this.toggleHelperTimer());
    }
    
    toggleHelperTimer() {
        const display = document.getElementById('helper-timer-display');
        const btn = document.getElementById('helper-timer-btn');
        
        if (this.helperTimerInterval) {
            // Stop the timer
            clearInterval(this.helperTimerInterval);
            this.helperTimerInterval = null;
            btn.textContent = 'Resume';
            display.classList.remove('running');
        } else {
            // Start/resume the timer
            if (this.helperTimerRemaining <= 0) {
                // Reset if completed
                const stage = this.flattenedStages[this.currentStageIndex];
                this.helperTimerRemaining = (stage.helperTimerMinutes || 4) * 60;
                display.classList.remove('complete', 'flashing');
            }
            
            display.classList.add('running');
            btn.textContent = 'Pause';
            
            this.helperTimerInterval = setInterval(() => {
                this.helperTimerRemaining--;
                display.textContent = this.formatHelperTime(this.helperTimerRemaining);
                
                if (this.helperTimerRemaining <= 0) {
                    clearInterval(this.helperTimerInterval);
                    this.helperTimerInterval = null;
                    display.classList.remove('running');
                    display.classList.add('complete', 'flashing');
                    btn.textContent = 'Reset';
                    this.playHelperTimerChime();
                }
            }, 1000);
        }
    }
    
    formatHelperTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    
    playHelperTimerChime() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Play a pleasant chime pattern
            const playTone = (freq, startTime, duration) => {
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                oscillator.frequency.value = freq;
                oscillator.type = 'sine';
                gainNode.gain.setValueAtTime(0.3, startTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
                oscillator.start(startTime);
                oscillator.stop(startTime + duration);
            };
            
            const now = audioContext.currentTime;
            playTone(880, now, 0.3);
            playTone(1100, now + 0.15, 0.3);
            playTone(1320, now + 0.3, 0.4);
        } catch (error) {
            console.log('Audio not available');
        }
    }
    
    viewPastStage(index) {
        this.showStage(index, true);
    }
    
    backToCurrentStage() {
        this.isViewingPast = false;
        this.viewingStageIndex = null;
        
        // Stop helper timer if running
        if (this.helperTimerInterval) {
            clearInterval(this.helperTimerInterval);
            this.helperTimerInterval = null;
        }
        
        // Check if we're in timer mode
        if (this.timer !== null) {
            this.showScreen('timer-screen');
            this.renderTimeline();
        } else {
            this.showStage(this.currentStageIndex, false);
        }
    }
    
    skipToStage() {
        const targetIndex = parseInt(document.getElementById('skip-to-stage-btn').getAttribute('data-target-index'), 10);
        
        if (isNaN(targetIndex) || targetIndex <= this.currentStageIndex) {
            return;
        }
        
        // Confirm the skip
        const skippedCount = targetIndex - this.currentStageIndex;
        const targetStage = this.flattenedStages[targetIndex];
        
        if (!confirm(`Skip ${skippedCount} stage${skippedCount > 1 ? 's' : ''} and jump to "${targetStage.name}"?`)) {
            return;
        }
        
        // If bake hasn't started yet, initialize it
        if (!this.bakeLog.startTime) {
            const timeInput = document.getElementById('starter-fed-time');
            let starterFedTime = new Date();
            
            if (timeInput && timeInput.value) {
                const [hours, minutes] = timeInput.value.split(':').map(Number);
                starterFedTime = new Date();
                starterFedTime.setHours(hours, minutes, 0, 0);
                if (starterFedTime > new Date()) {
                    starterFedTime.setDate(starterFedTime.getDate() - 1);
                }
            }
            
            const multiplierInput = document.getElementById('recipe-multiplier');
            this.recipeMultiplier = parseFloat(multiplierInput?.value) || 1;
            
            this.bakeLog = {
                recipeName: this.currentRecipeName,
                starterFedTime: starterFedTime,
                recipeMultiplier: this.recipeMultiplier,
                startTime: new Date(),
                endTime: null,
                ingredients: {},
                stages: [],
                starterExtraTime: 0
            };
        }
        
        // Clear any running timers silently (no chimes/alerts)
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        if (this.starterTimer) {
            clearInterval(this.starterTimer);
            this.starterTimer = null;
        }
        this.timerEndTime = null;
        this.timerDuration = 0;
        
        // Dismiss any open alerts
        this.dismissAlert();
        
        // Log all skipped stages and collect default ingredients
        for (let i = this.currentStageIndex; i < targetIndex; i++) {
            const skippedStage = this.flattenedStages[i];
            
            // Record default ingredients for this stage if it has ingredient inputs
            if (skippedStage.ingredientInputs && skippedStage.ingredientInputs.length > 0) {
                this.recordDefaultIngredients(skippedStage.ingredientInputs);
            }
            
            this.bakeLog.stages.push({
                id: skippedStage.id,
                name: skippedStage.name,
                skipped: true,
                startTime: new Date(),
                endTime: new Date(),
                duration: 0,
                expectedDuration: skippedStage.durationMinutes * 60 * 1000
            });
        }
        
        // Jump to target stage
        this.currentStageIndex = targetIndex;
        this.isViewingPast = false;
        this.viewingStageIndex = null;
        this.saveState();
        this.showStage();
    }
    
    recordDefaultIngredients(ingredientIds) {
        const multiplier = this.recipeMultiplier || 1;
        for (const ingredientId of ingredientIds) {
            // Skip if already recorded
            if (this.bakeLog.ingredients[ingredientId]) {
                continue;
            }
            
            const ingredient = this.ingredients.find(i => i.id === ingredientId);
            if (ingredient) {
                const scaledDefault = Math.round(ingredient.defaultAmount * multiplier);
                this.bakeLog.ingredients[ingredientId] = {
                    name: ingredient.name,
                    amount: scaledDefault,
                    defaultAmount: scaledDefault,
                    unit: ingredient.unit,
                    isDefault: true
                };
            }
        }
    }
    
    renderIngredientInputs(ingredientIds) {
        const container = document.getElementById('ingredient-inputs');
        container.innerHTML = '';
        
        // Filter to only show requested ingredients
        const ingredientsToShow = this.ingredients.filter(i => ingredientIds.includes(i.id));
        
        ingredientsToShow.forEach(ingredient => {
            const scaledDefault = Math.round(ingredient.defaultAmount * this.recipeMultiplier);
            const group = document.createElement('div');
            group.className = 'ingredient-input-group';
            group.innerHTML = `
                <label for="ingredient-${ingredient.id}">${ingredient.name}</label>
                <div class="input-wrapper">
                    <input 
                        type="number" 
                        id="ingredient-${ingredient.id}" 
                        data-ingredient-id="${ingredient.id}"
                        data-scaled-default="${scaledDefault}"
                        placeholder="${scaledDefault}"
                        min="0"
                        step="1"
                    >
                    <span class="unit">${ingredient.unit}</span>
                </div>
            `;
            container.appendChild(group);
        });
    }
    
    collectIngredients() {
        const inputs = document.querySelectorAll('#ingredient-inputs input');
        inputs.forEach(input => {
            const ingredientId = input.getAttribute('data-ingredient-id');
            const ingredient = this.ingredients.find(i => i.id === ingredientId);
            const value = input.value.trim();
            const scaledDefault = parseInt(input.getAttribute('data-scaled-default'), 10);
            
            if (value !== '') {
                this.bakeLog.ingredients[ingredientId] = {
                    name: ingredient.name,
                    amount: parseInt(value, 10),
                    defaultAmount: scaledDefault,
                    unit: ingredient.unit,
                    isDefault: false
                };
            } else {
                this.bakeLog.ingredients[ingredientId] = {
                    name: ingredient.name,
                    amount: scaledDefault,
                    defaultAmount: scaledDefault,
                    unit: ingredient.unit,
                    isDefault: true
                };
            }
        });
    }
    
    skipStage() {
        const stage = this.flattenedStages[this.currentStageIndex];
        
        // Stop helper timer if running
        if (this.helperTimerInterval) {
            clearInterval(this.helperTimerInterval);
            this.helperTimerInterval = null;
        }
        
        // Record default ingredients for this stage if it has ingredient inputs
        if (stage.ingredientInputs && stage.ingredientInputs.length > 0) {
            this.recordDefaultIngredients(stage.ingredientInputs);
        }
        
        const stageStartTime = new Date();
        
        // Log the skipped stage
        this.bakeLog.stages.push({
            id: stage.id,
            name: stage.name,
            skipped: true,
            startTime: stageStartTime,
            endTime: null,
            duration: null,
            expectedDuration: stage.durationMinutes * 60 * 1000,
            timerStarted: stageStartTime
        });
        
        // If there's a duration, still show the timer (resting time is still needed)
        if (stage.durationMinutes > 0) {
            this.startTimer(stage.durationMinutes);
        } else {
            // No timer needed, move to next stage
            const stageLog = this.bakeLog.stages[this.bakeLog.stages.length - 1];
            stageLog.endTime = new Date();
            stageLog.duration = stageLog.endTime - stageLog.startTime;
            
            this.currentStageIndex++;
            this.saveState();
            this.showStage();
        }
    }
    
    completeStage() {
        const stage = this.flattenedStages[this.currentStageIndex];
        
        // Stop helper timer if running
        if (this.helperTimerInterval) {
            clearInterval(this.helperTimerInterval);
            this.helperTimerInterval = null;
        }
        
        // Collect ingredients if this stage has ingredient inputs
        if (stage.ingredientInputs && stage.ingredientInputs.length > 0) {
            this.collectIngredients();
        }
        
        const stageStartTime = new Date();
        
        // Log the stage start
        this.bakeLog.stages.push({
            id: stage.id,
            name: stage.name,
            skipped: false,
            startTime: stageStartTime,
            endTime: null,
            duration: null,
            expectedDuration: stage.durationMinutes * 60 * 1000,
            timerStarted: stageStartTime
        });
        
        // If there's a duration, show timer
        if (stage.durationMinutes > 0) {
            this.startTimer(stage.durationMinutes);
        } else {
            // No timer needed, mark stage as complete and move on
            const stageLog = this.bakeLog.stages[this.bakeLog.stages.length - 1];
            stageLog.endTime = new Date();
            stageLog.duration = stageLog.endTime - stageLog.startTime;
            
            this.currentStageIndex++;
            this.saveState();
            this.showStage();
        }
    }
    
    startTimer(durationMinutes) {
        const stage = this.flattenedStages[this.currentStageIndex];
        const nextStage = this.flattenedStages[this.currentStageIndex + 1];
        
        this.timerDuration = durationMinutes * 60 * 1000;
        this.timerEndTime = Date.now() + this.timerDuration;
        
        // Update next stage label
        document.getElementById('next-stage-label').textContent = 
            nextStage ? `Next: ${nextStage.name}` : 'Final stage!';
        
        // Reset timer note
        document.getElementById('timer-note').textContent = 'Timer running...';
        document.getElementById('timer-note').classList.remove('complete');
        
        this.showScreen('timer-screen');
        this.renderTimeline();
        this.saveState();
        
        // Start timer interval
        this.updateTimerDisplay();
        this.timer = setInterval(() => this.updateTimerDisplay(), 1000);
    }
    
    updateTimerDisplay() {
        const remaining = Math.max(0, this.timerEndTime - Date.now());
        
        const hours = Math.floor(remaining / (1000 * 60 * 60));
        const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
        
        document.getElementById('timer-hours').textContent = String(hours).padStart(2, '0');
        document.getElementById('timer-minutes').textContent = String(minutes).padStart(2, '0');
        document.getElementById('timer-seconds').textContent = String(seconds).padStart(2, '0');
        
        // Update progress bar
        const elapsed = this.timerDuration - remaining;
        const progress = (elapsed / this.timerDuration) * 100;
        document.getElementById('timer-progress').style.width = `${progress}%`;
        
        // Timer complete
        if (remaining <= 0) {
            clearInterval(this.timer);
            this.timer = null;
            document.getElementById('timer-note').textContent = 'Timer complete! Ready for next stage.';
            document.getElementById('timer-note').classList.add('complete');
            this.showAlert();
        }
    }
    
    showAlert() {
        const nextStage = this.flattenedStages[this.currentStageIndex + 1];
        document.getElementById('alert-message').textContent = 
            nextStage ? `Time for: ${nextStage.name}` : 'Your bake is complete!';
        document.getElementById('alert-modal').style.display = 'flex';
        
        // Play notification sound (if available)
        this.playNotificationSound();
    }
    
    playNotificationSound() {
        // Create a simple beep using Web Audio API
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = 800;
            oscillator.type = 'sine';
            gainNode.gain.value = 0.3;
            
            oscillator.start();
            
            // Beep pattern
            setTimeout(() => {
                oscillator.stop();
            }, 200);
            
            setTimeout(() => {
                const osc2 = audioContext.createOscillator();
                const gain2 = audioContext.createGain();
                osc2.connect(gain2);
                gain2.connect(audioContext.destination);
                osc2.frequency.value = 1000;
                osc2.type = 'sine';
                gain2.gain.value = 0.3;
                osc2.start();
                setTimeout(() => osc2.stop(), 200);
            }, 300);
            
        } catch (error) {
            console.log('Audio notification not available');
        }
    }
    
    dismissAlert() {
        document.getElementById('alert-modal').style.display = 'none';
    }
    
    continueToNextStage() {
        // Clear any running timer
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        
        // Update stage log with end time
        const stageLog = this.bakeLog.stages[this.bakeLog.stages.length - 1];
        if (stageLog) {
            stageLog.endTime = new Date();
            stageLog.duration = stageLog.endTime - stageLog.startTime;
            
            // Calculate if timer was cut short or extended
            const timerActualDuration = stageLog.endTime - stageLog.timerStarted;
            stageLog.timerDifference = timerActualDuration - stageLog.expectedDuration;
        }
        
        // Move to next stage
        this.currentStageIndex++;
        this.timerEndTime = null;
        this.timerDuration = 0;
        this.saveState();
        
        // Dismiss any open alert
        this.dismissAlert();
        
        // Show next stage or summary
        this.showStage();
    }
    
    showSummary() {
        this.bakeLog.endTime = new Date();
        this.clearState(); // Bake complete, clear saved state
        
        const summary = this.generateSummary();
        document.getElementById('summary-content').textContent = summary;
        
        this.showScreen('summary-screen');
        this.renderTimeline();
    }
    
    generateSummary() {
        const lines = [];
        const starterFedDate = new Date(this.bakeLog.starterFedTime);
        const startDate = new Date(this.bakeLog.startTime);
        const endDate = new Date(this.bakeLog.endTime);
        const multiplier = this.bakeLog.recipeMultiplier || 1;
        
        // Calculate actual total time from stages
        let actualTotalMs = 0;
        for (const stage of this.bakeLog.stages) {
            if (!stage.skipped && stage.duration) {
                actualTotalMs += stage.duration;
            }
        }
        
        lines.push('═══════════════════════════════════════');
        lines.push('        SOURDOUGH BAKE LOG');
        lines.push('═══════════════════════════════════════');
        lines.push('');
        lines.push(`Recipe: ${this.bakeLog.recipeName || 'Unknown'}`);
        lines.push(`Date: ${startDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`);
        if (multiplier !== 1) {
            lines.push(`Recipe Quantity: ${multiplier}×`);
        }
        lines.push(`Starter Fed: ${starterFedDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`);
        lines.push(`Bake Started: ${startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`);
        lines.push(`Bake Ended: ${endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`);
        lines.push(`Total Duration: ${this.formatDuration(endDate - starterFedDate)}`);
        lines.push(`Active Bake Time: ${this.formatDuration(actualTotalMs)}`);
        lines.push('');
        
        // Ingredients
        lines.push('───────────────────────────────────────');
        lines.push('INGREDIENTS');
        lines.push('───────────────────────────────────────');
        
        const ingredientKeys = Object.keys(this.bakeLog.ingredients);
        if (ingredientKeys.length > 0) {
            for (const key of ingredientKeys) {
                const ing = this.bakeLog.ingredients[key];
                let note = '';
                if (!ing.isDefault && ing.defaultAmount) {
                    const percentDiff = ((ing.amount - ing.defaultAmount) / ing.defaultAmount * 100);
                    if (percentDiff > 0) {
                        note = ` (+${percentDiff.toFixed(0)}%)`;
                    } else if (percentDiff < 0) {
                        note = ` (${percentDiff.toFixed(0)}%)`;
                    }
                }
                lines.push(`  ${ing.name}: ${ing.amount}${ing.unit}${note}`);
            }
        } else {
            lines.push('  (No ingredients recorded)');
        }
        lines.push('');
        
        // Baker's Math
        lines.push('───────────────────────────────────────');
        lines.push("BAKER'S MATH");
        lines.push('───────────────────────────────────────');
        
        // Calculate total flour (flour ingredients)
        const flourIds = ['bread-flour', 'whole-wheat-flour', 'ap-flour', 'rye-flour'];
        let totalFlour = 0;
        const isFlour = (key, ing) => {
            return flourIds.includes(key) || 
                   key.toLowerCase().includes('flour') || 
                   ing.name.toLowerCase().includes('flour');
        };
        
        for (const key of ingredientKeys) {
            const ing = this.bakeLog.ingredients[key];
            if (isFlour(key, ing)) {
                totalFlour += ing.amount;
            }
        }
        
        if (totalFlour > 0) {
            lines.push(`  Total Flour: ${totalFlour}g (100%)`);
            for (const key of ingredientKeys) {
                const ing = this.bakeLog.ingredients[key];
                if (!isFlour(key, ing)) {
                    const percent = (ing.amount / totalFlour * 100).toFixed(1);
                    lines.push(`  ${ing.name}: ${percent}%`);
                }
            }
        } else {
            lines.push('  (No flour ingredients recorded)');
        }
        lines.push('');
        
        // Stages
        lines.push('───────────────────────────────────────');
        lines.push('STAGES');
        lines.push('───────────────────────────────────────');
        
        for (const stage of this.bakeLog.stages) {
            if (stage.skipped) {
                lines.push(`  ○ ${stage.name}: SKIPPED`);
            } else {
                const duration = this.formatDuration(stage.duration);
                let note = '';
                
                if (stage.expectedDuration > 0 && stage.timerDifference !== undefined) {
                    if (stage.timerDifference > 60000) {
                        note = ` (+${this.formatDuration(stage.timerDifference)} extra)`;
                    } else if (stage.timerDifference < -60000) {
                        note = ` (${this.formatDuration(Math.abs(stage.timerDifference))} early)`;
                    }
                }
                
                lines.push(`  ● ${stage.name}: ${duration}${note}`);
            }
        }
        lines.push('');
        lines.push('═══════════════════════════════════════');
        lines.push('');
        lines.push('Notes:');
        lines.push('');
        lines.push('');
        
        return lines.join('\n');
    }
    
    formatDuration(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds}s`;
        } else {
            return `${seconds}s`;
        }
    }
    
    copySummary() {
        const summary = document.getElementById('summary-content').textContent;
        
        navigator.clipboard.writeText(summary).then(() => {
            this.showToast('Summary copied to clipboard!');
        }).catch(err => {
            console.error('Failed to copy:', err);
            // Fallback: select the text
            const range = document.createRange();
            range.selectNodeContents(document.getElementById('summary-content'));
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
            this.showToast('Text selected - press Ctrl+C/Cmd+C to copy');
        });
    }
    
    showToast(message) {
        // Remove existing toast if any
        const existingToast = document.querySelector('.toast');
        if (existingToast) {
            existingToast.remove();
        }
        
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 2500);
    }
    
    resetBake() {
        this.currentStageIndex = 0;
        this.recipeMultiplier = 1;
        this.timerEndTime = null;
        this.timerDuration = 0;
        this.bakeLog = {
            recipeName: null,
            starterFedTime: null,
            recipeMultiplier: 1,
            startTime: null,
            endTime: null,
            ingredients: {},
            stages: []
        };
        
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        
        // Clear saved state
        this.clearState();
        
        // Clear the inputs
        document.getElementById('starter-fed-time').value = '';
        document.getElementById('recipe-multiplier').value = '1';
        
        this.renderTimeline();
        this.showScreen('welcome-screen');
    }
    
    goHome() {
        // If bake is in progress, confirm before abandoning
        if (this.bakeLog.startTime && !this.bakeLog.endTime) {
            if (!confirm('Abandon current bake and start over?')) {
                return;
            }
        }
        this.resetBake();
    }
}

// Initialize the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new SourdoughTimeline();
});
