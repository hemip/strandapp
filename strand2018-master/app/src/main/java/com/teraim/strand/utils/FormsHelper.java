package com.teraim.strand.utils;

import android.widget.Spinner;
import java.util.Arrays;

public abstract class FormsHelper {

    public static void SetSpinnerSelection(Spinner spinner, String[] items, String selectedItem) {
        int habitatIndex = Arrays.asList(items).indexOf(selectedItem);
        habitatIndex = habitatIndex > -1 ? habitatIndex : 0;
        spinner.setSelection(habitatIndex, true);
    }

}
