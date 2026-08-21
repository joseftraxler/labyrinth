import {Theme} from "../theme.js";

/**
 * Levely bez tématu – kamenné katakomby pod městem. Je to podoba, kterou má
 * `Theme` sama, takže tady nezbývá než říct, že žádné jméno nemá.
 *
 * I „žádné téma“ je jedno z prostředí a ve hře se střídá s ostatními – nemá to
 * být jen náhradní řešení pro chybějící téma.
 */
export class Default extends Theme {
    name() {
        return null;
    }
}
