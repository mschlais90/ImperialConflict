import { button } from './dom';

export function renderTutorialScreen(root: HTMLElement, onBack: () => void): void {
  const shell = document.createElement('div');
  shell.className = 'start-screen interactive';

  const panel = document.createElement('div');
  panel.className = 'tutorial-panel';

  const header = document.createElement('div');
  header.className = 'tutorial-header';
  const title = document.createElement('h1');
  title.textContent = 'How to Play';
  const backBtn = button('Back', onBack, 'ui-button');
  backBtn.type = 'button';
  header.append(title, backBtn);

  const content = document.createElement('div');
  content.className = 'tutorial-content';
  content.innerHTML = `
    <section>
      <h2>Overview</h2>
      <p>Imperial Conflict is a real-time 4X space strategy game. You control an empire in a galaxy of 30 star systems and ~300 planets. Build your economy, raise armies, research technology, and conquer rival empires.</p>
      <p><strong>Goal:</strong> Eliminate all enemy empires by capturing their planets. You lose if all your planets are taken.</p>
    </section>

    <section>
      <h2>Getting Started</h2>
      <p>You begin with one home planet, some starting resources, and an explorer. Your first priorities:</p>
      <ol>
        <li><strong>Build economy</strong> — Queue Cash Factories, Farms, and Mines on your home planet</li>
        <li><strong>Explore</strong> — Build explorers and send them to uncolonized planets to expand</li>
        <li><strong>Research</strong> — Set your research allocation (press <kbd>R</kbd>) to boost your empire</li>
        <li><strong>Raise military</strong> — Train fighters and soldiers to defend and attack</li>
      </ol>
    </section>

    <section>
      <h2>Resources</h2>
      <div class="tutorial-grid">
        <div><strong>GC</strong> (Credits)</div><div>Primary currency for building and training</div>
        <div><strong>Food</strong></div><div>Feeds population and military units</div>
        <div><strong>Iron</strong></div><div>Used for buildings and combat units</div>
        <div><strong>Endurium</strong></div><div>Advanced material for portals and heavy units</div>
        <div><strong>Octarine</strong></div><div>Magical resource for wizard spells</div>
      </div>
    </section>

    <section>
      <h2>Buildings</h2>
      <div class="tutorial-grid">
        <div><strong>Cash Factory</strong></div><div>Generates GC income</div>
        <div><strong>Farm</strong></div><div>Produces food</div>
        <div><strong>Mine</strong></div><div>Produces iron</div>
        <div><strong>Refinery</strong></div><div>Produces endurium</div>
        <div><strong>Occult Center</strong></div><div>Produces octarine</div>
        <div><strong>Research Center</strong></div><div>Generates research points</div>
        <div><strong>Tax Office</strong></div><div>Boosts GC income</div>
        <div><strong>Living Quarter</strong></div><div>Increases max population</div>
        <div><strong>Laser Turret</strong></div><div>Planetary defense against bombers</div>
        <div><strong>Portal</strong></div><div>Enables instant fleet transport (one per planet)</div>
      </div>
      <p>Use <kbd>B</kbd> to open the Planet Builder for mass-building across multiple planets.</p>
    </section>

    <section>
      <h2>Military Units</h2>
      <div class="tutorial-grid">
        <div><strong>Fighter</strong></div><div>Air-to-air combat</div>
        <div><strong>Bomber</strong></div><div>Attacks ground defenses (lasers)</div>
        <div><strong>Soldier</strong></div><div>Ground combat, captures planets</div>
        <div><strong>Droid</strong></div><div>Ground combat, no food upkeep</div>
        <div><strong>Transport</strong></div><div>Carries ground troops</div>
        <div><strong>Explorer</strong></div><div>Colonizes unowned planets</div>
        <div><strong>Agent</strong></div><div>Espionage and sabotage operations</div>
        <div><strong>Wizard</strong></div><div>Casts spells against enemies</div>
      </div>
    </section>

    <section>
      <h2>Combat</h2>
      <p>Send fleets to enemy planets to attack. Combat has three phases:</p>
      <ol>
        <li><strong>Air vs Ground</strong> — Bombers attack laser turrets</li>
        <li><strong>Air vs Air</strong> — Fighters battle enemy fighters</li>
        <li><strong>Ground vs Ground</strong> — Soldiers and droids fight for the planet</li>
      </ol>
      <p>The winner captures the planet. Military research increases combat strength.</p>
    </section>

    <section>
      <h2>Research</h2>
      <p>Allocate research points across five fields (must total 100%):</p>
      <div class="tutorial-grid">
        <div><strong>Military</strong></div><div>Combat attack and defense bonuses</div>
        <div><strong>Welfare</strong></div><div>Increases max population per planet</div>
        <div><strong>Economy</strong></div><div>Boosts GC income</div>
        <div><strong>Construction</strong></div><div>Reduces build time and costs</div>
        <div><strong>Resources</strong></div><div>Increases resource production</div>
      </div>
    </section>

    <section>
      <h2>Special Operations</h2>
      <p>Agents and wizards perform covert operations against enemy empires:</p>
      <p><strong>Agent ops:</strong> Spy, Destroy Cash, Destroy Units, Sabotage Portals</p>
      <p><strong>Wizard spells:</strong> Vision, Hypnotize, Reduce Food, Destroy Iron</p>
      <p>Success chance depends on your unit count vs. the target's networth. Failed ops lose 5% of your agents/wizards.</p>
    </section>

    <section>
      <h2>Portals & Fleet Movement</h2>
      <p>Fleets travel between star systems — distance affects travel time. Build a <strong>Portal</strong> on a planet to enable instant fleet deployment from any portal planet. Use <kbd>F</kbd> to open Fleet Management for an overview of all units and fleets.</p>
    </section>

    <section>
      <h2>Keyboard Shortcuts</h2>
      <div class="tutorial-grid shortcuts">
        <div><kbd>G</kbd></div><div>Galaxy view</div>
        <div><kbd>E</kbd></div><div>Economy panel</div>
        <div><kbd>A</kbd></div><div>Standings</div>
        <div><kbd>B</kbd></div><div>Planet Builder</div>
        <div><kbd>F</kbd></div><div>Fleet Management</div>
        <div><kbd>R</kbd></div><div>Research</div>
        <div><kbd>O</kbd></div><div>Special Ops</div>
        <div><kbd>H</kbd></div><div>Battle History</div>
        <div><kbd>N</kbd></div><div>Notifications</div>
        <div><kbd>S</kbd></div><div>Settings</div>
        <div><kbd>0–4</kbd></div><div>Pause / Set game speed</div>
        <div><kbd>ESC</kbd></div><div>Close panel / Galaxy view</div>
        <div><kbd>?</kbd></div><div>Shortcut help overlay</div>
      </div>
    </section>

    <section>
      <h2>Tips</h2>
      <ul>
        <li>Expand fast early — more planets means more income and production</li>
        <li>Don't neglect food — starving units lose effectiveness</li>
        <li>Build portals on frontier planets for rapid fleet response</li>
        <li>Check standings (<kbd>A</kbd>) to identify the strongest rival</li>
        <li>Use agents to spy before committing to a large attack</li>
        <li>Balance research — economy and military are usually the top priorities</li>
      </ul>
    </section>
  `;

  panel.append(header, content);
  shell.append(panel);
  root.append(shell);
}
