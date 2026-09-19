// Presentation only: no experiment controls or simulation state.
export const projectOverview = `
  <section id="how-it-works" aria-labelledby="how-heading">
    <h2 id="how-heading">How it works</h2>
    <p>What would it take for an Archon to act on its own? ArchonBrain explores autonomy and a sense of life through a body that responds to its environment. A computational model based on the fruit-fly connectome drives this live experiment; moving A or B changes what it senses next.</p>
    <ol class="overview-stages">
      <li><strong>Sense.</strong> Virtual energy sources supply signals mapped to simulated odor inputs. This is a sensory mapping, not physical odor sensing.</li>
      <li><strong>Respond.</strong> Measured fly brain outputs influence movement, turning, and absorption control. Application rules translate those outputs into body commands.</li>
      <li><strong>Feed back.</strong> Movement changes relative positions; absorption reduces source energy. Both change the next sensory inputs.</li>
    </ol>
    <p>Sensory mappings, motor readouts, contact rules, and animations include engineered application logic. Individual joint movements and high-level decisions do not all emerge directly from the connectome.</p>
  </section>
  <section id="current-actions">
    <h2>What you can do right now</h2>
    <ul>
      <li>Move A or B in the scene and watch neural activity alongside movement and absorption. Use <strong>View all</strong> to return from <strong>Free view</strong> to source editing.</li>
      <li>Use the Environment map to read relative positions and Energy left to follow consumption.</li>
      <li>Use <strong>Start over</strong> to restore the same initial arrangement for comparison.</li>
      <li>In the existing <a href="/?tools=1" target="_blank" rel="noopener">experiment tools</a>, change <strong>Signal strength</strong>, save or load conditions, or use <strong>Try one source</strong>. Tools open separately; they do not continue this running brain state.</li>
    </ul>
  </section>
  <section id="current-capabilities">
    <h2>What the current demo demonstrates</h2>
    <p>The sensory-input → neural-output → body → environment loop is connected. Source placement changes the supplied signals, actual neural outputs contribute to movement and absorption, and the changed environment feeds subsequent inputs.</p>
    <p>Existing output-disconnection and directional-input comparisons help distinguish neural contributions from a purely pre-scripted animation. These results apply to the tested implementation and conditions; they do not establish universal navigation or optimal decisions.</p>
    <a href="/?tools=1#learn-section" target="_blank" rel="noopener">View comparison tools ↗</a>
  </section>
  <section id="current-limits">
    <h2>What it does not do yet</h2>
    <ul>
      <li>The deployed controller does not improve through repeated experience. Repeating or restarting is not training, and changing neural activity is not evidence of learning.</li>
      <li>Choosing the strongest source, visiting every source, and consuming all remaining energy are not guaranteed. Results have been evaluated under limited experimental conditions.</li>
      <li>Saving experiment conditions preserves a starting arrangement and settings, not an ongoing brain state or memory.</li>
    </ul>
  </section>
  <section id="project-roadmap">
    <h2>What we want to build next</h2>
    <div class="overview-roadmap">
      <article><span class="roadmap-status">Planned exploration</span><h3>Learning &amp; adaptation</h3><p>Investigate whether limited parts of the neural control pathway can adapt through repeated trials.</p><p>The aim is to test whether experience can improve energy acquisition, rather than only producing a fixed response.</p></article>
      <article><span class="roadmap-status">Planned exploration</span><h3>Before-and-after evaluation</h3><p>Compare a fixed baseline with an adapted controller on unseen source layouts.</p><p>Improvement should be measured, not inferred from an animation or a training counter.</p></article>
      <article><span class="roadmap-status">Planned exploration</span><h3>Clearer neural-to-behavior explanations</h3><p>Make the contribution of sensory signals, measured neural activity, and engineered control rules easier to understand.</p><p>Visitors should be able to tell what the model contributes and what the application supplies.</p></article>
      <article><span class="roadmap-status">Long-term exploration</span><h3>Beyond the Archon</h3><p>Explore other StarCraft units with different bodies, sensory mappings and control tasks, potentially extending to the wider cast.</p><p>Each unit would need its own integration and evaluation. Only the Archon is implemented today; a full roster is an aspiration, not a promised feature.</p></article>
      <article><span class="roadmap-status">Ongoing refinement</span><h3>A more approachable public experience</h3><p>Continue separating the interactive demonstration, experiment controls, and developer diagnostics.</p><p>The project should be understandable without reading raw neural data.</p></article>
    </div>
  </section>
  <section id="project-direction">
    <h2>Why this direction matters</h2>
    <div><p>The creative goal is to give a familiar character autonomy and vitality: a world to sense, a body to act with, and consequences that shape its next response. The connected loop exists today. Learning and broader character support remain questions for future experiments, not claims of consciousness or biological life.</p><p>ArchonBrain is an independent, non-commercial fan-made creative project. It is not affiliated with or endorsed by Blizzard Entertainment. StarCraft and its characters belong to their respective rights holders.</p></div>
  </section>`;
