package com.teraim.strand.exporter;

import java.util.List;
import java.util.Map;

import android.app.AlertDialog;
import android.content.Context;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.View;
import android.view.View.OnClickListener;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.CheckBox;
import android.widget.TextView;

import com.teraim.strand.R;
import com.teraim.strand.exporter.JSONify.JSON_Report;
import com.teraim.strand.Provyta;

class ProvytaAdapter extends BaseAdapter {

    private LayoutInflater mLayoutInflater;
    private List<Provyta> pyList;
    private Map<String,JSON_Report> jsonL;
    private Context myCtx;
    private boolean isChecked[];

    ProvytaAdapter(Context context, List<Provyta> pyList, Map<String, JSON_Report> jsonL) {
        mLayoutInflater = LayoutInflater.from(context);
        this.pyList=pyList;
        this.jsonL=jsonL;
        myCtx = context;
        isChecked = new boolean[pyList!=null?pyList.size():0];
    }

    private Context getContext() {
        return myCtx;
    }
	/* (non-Javadoc)
	 * @see android.widget.ArrayAdapter#getView(int, android.view.View, android.view.ViewGroup)
	 */

    boolean[] getIsChecked() {
        return isChecked;
    }


    @Override
    public View getView(final int position, View convertView, ViewGroup parent) {

        if(convertView==null)
            convertView = mLayoutInflater.inflate(R.layout.pylist_row, null);

        final Provyta py = pyList.get(position);

        final CheckBox cb = ((CheckBox) convertView.findViewById(R.id.export));
        ((TextView)convertView.findViewById(R.id.pyName)).setText(py.getpyID());
        ((TextView)convertView.findViewById(R.id.markedReady)).setText(py.isLocked()?"Ja":"Nej");



        final JSON_Report json = jsonL.get(py.getpyID());
        cb.setChecked(isChecked[position]);
        cb.setTag(position);
        cb.setOnClickListener(new OnClickListener() {
            @Override
            public void onClick(View v) {
                isChecked[(Integer)cb.getTag()]=cb.isChecked();
                Log.d("bortex",cb.getTag()+"isch "+isChecked[(Integer)cb.getTag()]+"pos "+position);
            }
        });

        //((TextView)convertView.findViewById(R.id.markedExported)).setText("_");
        TextView tomma = ((TextView)convertView.findViewById(R.id.tomma));
        tomma.setText(Integer.toString(json.empty.size()));
        tomma.setOnClickListener(new OnClickListener() {

            @Override
            public void onClick(View v) {
                String out = format(json.empty);
                AlertDialog.Builder builder = new AlertDialog.Builder(ProvytaAdapter.this.getContext());
                builder.setTitle("Variabler som inte angivits")
                        .setMessage(out).setPositiveButton("Ok", null)
                        .show();
                Log.d("v",json.json);
            }

            private String format(List<String> empty) {
                String out ="";
                int rows = 4;
                int rc=0;
                for(String s:empty) {
                    if(rc<rows) {
                        rc++;
                        out+=s+", ";
                    } else {
                        rc=0;
                        out+=s+"\n";
                    }
                }
                return out;
            }

        });

        return convertView;
    }


    @Override
    public int getCount() {
        Log.d("Strand","Getcount called");
        return pyList.size();
    }

    @Override
    public Object getItem(int position) {
        Log.d("Strand","GetItem called");
        return pyList.get(position);
    }

    @Override
    public long getItemId(int position) {
        Log.d("Strand","GetItemId called");
        return position;
    }



}
