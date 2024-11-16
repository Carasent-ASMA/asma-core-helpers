export const NORWEGIAN_PHONE_NUMBER = {
    placeholder: 'Mobilnummer',
    format: '### ## ###',
    mask: '_',
    //thousandSeparator: "",
    //prefix: "",
    //suffix: ""
}

export const PERSONAL_NUMBER = {
    placeholder: 'Fødselsnummer - 11 sifre',
    format: '###### #####',
    mask: '_',
    //thousandSeparator: "",
    //prefix: "",
    //suffix: ""
}
export const ORDINARY = {
    placeholder: 'Svar',
    //format:"",
    //mask:"_",
    thousandSeparator: ',',
    //prefix: "",
    //suffix: ""
}
export const YEARS = {
    placeholder: 'Svar',
    format: '####',
    mask: '_',
    thousandSeparator: false,
    prefix: 'År: ',
    //suffix: "År"
}

export const CURRENCY_NOK = {
    placeholder: 'Svar',
    //format:"###",
    //mask:"_",
    thousandSeparator: true,
    prefix: 'Kr: ',
    //suffix: "År"
}

export const DATE_OF_BIRTH = {
    placeholder: 'Svar',
    format: '##.##.####',
    mask: ['D', 'D', 'M', 'M', 'Y', 'Y', 'Y', 'Y'],
    thousandSeparator: false,
}
