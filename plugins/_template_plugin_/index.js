/**
 * PokePad Template Plugin - Main Process Logic
 * 
 * This file is executed whenever a workflow step of type "com.pokepad.template" is run.
 */

/**
 * The main execution function for the plugin.
 * 
 * @param {Object} params - The parameter values configured by the user in the PokePad UI.
 *                          The keys match the "name" fields in your manifest.json.
 * @param {Object} context - Data about the current execution state.
 * @param {Object} context.variables - Access to global variables ($var_name).
 * @param {boolean} context.prevStepSuccess - Whether the previous action in the workflow succeeded.
 * @param {Object} utils - Helpful utilities provided by PokePad.
 * @param {Function} utils.log - Send an info message to the PokePad log.
 * @param {Function} utils.error - Send an error message to the PokePad log.
 */
module.exports = async (params, context, utils) => {
  const { textToLog, repeatCount } = params;
  
  utils.log(`[Template] Starting execution...`);
  
  // Example of using parameters
  for (let i = 0; i < (repeatCount || 1); i++) {
    utils.log(`[Template] (${i + 1}/${repeatCount}) ${textToLog}`);
  }

  // Example of accessing global variables
  if (context.variables['last_signal']) {
    utils.log(`[Template] The last signal received was: ${context.variables['last_signal']}`);
  }

  // Plugins can be asynchronous
  await new Promise(resolve => setTimeout(resolve, 500));
  
  utils.log(`[Template] Execution finished!`);
};
